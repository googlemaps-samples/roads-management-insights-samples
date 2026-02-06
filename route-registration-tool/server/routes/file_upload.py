# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


"""
File upload processing API endpoints
Processes geospatial files using GDAL library with auto-detection
Supports all GDAL-supported formats: GeoJSON, Shapefile, KML, KMZ, GPX, etc.
"""

import json
import logging
import tempfile
import os
import zipfile
import shutil
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
import asyncio

# Try to import GDAL - make it optional so server can start without it
try:
    from osgeo import gdal, ogr
    GDAL_AVAILABLE = True
except ImportError:
    GDAL_AVAILABLE = False
    gdal = None
    ogr = None

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("file_upload_api")

router = APIRouter(prefix="/file-upload", tags=["File Upload"])

# Maximum number of features allowed
MAX_FEATURES = 500


class FeatureInfo(BaseModel):
    """Information about a single feature"""
    geometry: Dict[str, Any] = Field(..., description="GeoJSON geometry object")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Feature properties")


class FilePreviewResponse(BaseModel):
    """Response from file preview (analysis only)"""
    success: bool = Field(..., description="Whether preview was successful")
    feature_count: int = Field(..., description="Number of features found")
    available_properties: List[str] = Field(default_factory=list, description="Available property keys from features")
    message: Optional[str] = Field(None, description="Status message")


class FileProcessingResponse(BaseModel):
    """Response from file processing"""
    success: bool = Field(..., description="Whether processing was successful")
    feature_count: int = Field(..., description="Number of features found")
    features: List[FeatureInfo] = Field(..., description="List of processed features")
    available_properties: List[str] = Field(default_factory=list, description="Available property keys from features")
    message: Optional[str] = Field(None, description="Status message")


def extract_and_find_shapefile(zip_path: str) -> str:
    """
    Extract ZIP file and find the .shp file inside.
    
    Args:
        zip_path: Path to the ZIP file
        
    Returns:
        Path to the .shp file or the directory containing shapefile components
    """
    extract_dir = tempfile.mkdtemp()
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        # Find .shp file in the extracted directory
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                if file.lower().endswith('.shp'):
                    shp_path = os.path.join(root, file)
                    # Return the directory containing the shapefile (GDAL needs all components)
                    return os.path.dirname(shp_path)
        
        # If no .shp found, return the extract directory (might have shapefile at root)
        return extract_dir
        
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=400,
            detail="Invalid ZIP file format"
        )
    except Exception as e:
        # Clean up on error
        if os.path.exists(extract_dir):
            shutil.rmtree(extract_dir, ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail=f"Failed to extract ZIP file: {str(e)}"
        )


def process_file_with_gdal(file_path: str, is_directory: bool = False) -> Dict[str, Any]:
    """
    Process geospatial file using GDAL/OGR with auto-detection
    
    Supports all GDAL-supported formats: GeoJSON, Shapefile, KML, KMZ, GPX, etc.
    
    Args:
        file_path: Path to the geospatial file
        
    Returns:
        Dictionary with features and metadata
    """
    if not GDAL_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="GDAL library is not available. Please install GDAL: pip install gdal or brew install gdal (macOS)"
        )
    
    try:
        # Use GDAL's auto-detection to open any supported format
        # ogr.Open() automatically detects the format based on file extension and content
        datasource = ogr.Open(file_path, 0)  # 0 = read-only
        if datasource is None:
            raise HTTPException(
                status_code=400,
                detail="Failed to open file. GDAL could not recognize the file format. "
                       "Supported formats include: GeoJSON, Shapefile, KML, KMZ, GPX, and other GDAL-supported vector formats."
            )
        
        # Get the first layer (most files have one layer)
        layer_count = datasource.GetLayerCount()
        if layer_count == 0:
            raise HTTPException(status_code=400, detail="No layers found in file")
        
        layer = datasource.GetLayer(0)
        if layer is None:
            raise HTTPException(status_code=400, detail="Failed to access layer in file")
        
        # Get the spatial reference system (SRS) from the layer
        source_srs = layer.GetSpatialRef()
        
        # Create coordinate transformation to WGS84 (EPSG:4326) if needed
        target_srs = ogr.osr.SpatialReference()
        target_srs.ImportFromEPSG(4326)  # WGS84
        transform = None
        
        if source_srs:
            # Log source SRS for debugging
            try:
                srs_wkt = source_srs.ExportToWkt()
                logger.info(f"Source SRS detected: {srs_wkt[:200]}...")  # Log first 200 chars
            except:
                pass
            
            if not source_srs.IsSame(target_srs):
                # Only create transformation if SRS is different from WGS84
                try:
                    transform = ogr.osr.CoordinateTransformation(source_srs, target_srs)
                    logger.info("Coordinate transformation created successfully")
                except Exception as e:
                    logger.warning(f"Failed to create coordinate transformation: {str(e)}")
                    transform = None
            else:
                logger.info("Source SRS is already WGS84, no transformation needed")
        else:
            logger.warning("No spatial reference system found in layer - coordinates may need manual transformation")
        
        feature_count = layer.GetFeatureCount()
        
        # Check feature count limit
        if feature_count > MAX_FEATURES:
            raise HTTPException(
                status_code=400,
                detail=f"File contains {feature_count} features. Maximum allowed is {MAX_FEATURES} features."
            )
        
        # Extract all features
        features = []
        property_keys = set()
        
        layer.ResetReading()
        feature = layer.GetNextFeature()
        
        while feature:
            # Get geometry
            geometry = feature.GetGeometryRef()
            if geometry is None:
                feature = layer.GetNextFeature()
                continue
            
            # Clone geometry before transforming (to avoid modifying original)
            geometry = geometry.Clone()
            
            # Transform geometry to WGS84 if needed
            if transform:
                result = geometry.Transform(transform)
                if result != 0:  # 0 = success
                    logger.warning(f"Coordinate transformation failed with code {result}")
                    # Continue anyway - might still work
            
            # Convert to GeoJSON geometry (now in WGS84)
            geometry_json = json.loads(geometry.ExportToJson())
            
            # Validate coordinates are in valid WGS84 range
            def validate_coords(coords_list):
                """Recursively validate coordinates are in WGS84 range"""
                for coord in coords_list:
                    if isinstance(coord, (list, tuple)):
                        if len(coord) >= 2 and isinstance(coord[0], (int, float)):
                            lon, lat = coord[0], coord[1]
                            if not (-180 <= lon <= 180) or not (-90 <= lat <= 90):
                                raise HTTPException(
                                    status_code=400,
                                    detail=f"Invalid coordinates detected (lon={lon}, lat={lat}). The file appears to be in a projected coordinate system that GDAL could not automatically transform to WGS84. Please ensure your shapefile includes a .prj file with projection information, or convert the file to WGS84 (EPSG:4326) before uploading."
                                )
                        elif isinstance(coord[0], (list, tuple)):
                            # Nested coordinates (Polygon rings, MultiLineString, etc.)
                            validate_coords(coord)
            
            # Validate coordinates based on geometry type
            geom_type = geometry_json.get("type")
            if geom_type == "Point":
                coords = geometry_json.get("coordinates", [])
                if len(coords) >= 2:
                    lon, lat = coords[0], coords[1]
                    if not (-180 <= lon <= 180) or not (-90 <= lat <= 90):
                        logger.error(f"Invalid Point coordinates: lon={lon}, lat={lat}")
                        raise HTTPException(
                            status_code=400,
                            detail=f"Invalid coordinates detected (lon={lon}, lat={lat}). The file may be in a projected coordinate system that GDAL could not automatically transform. Please ensure your shapefile includes a .prj file with projection information."
                        )
            elif geom_type in ["LineString", "MultiPoint"]:
                coords = geometry_json.get("coordinates", [])
                validate_coords(coords)
            elif geom_type in ["Polygon", "MultiLineString", "MultiPolygon"]:
                coords = geometry_json.get("coordinates", [])
                validate_coords(coords)
            
            # Get properties
            properties = {}
            feature_defn = feature.GetDefnRef()
            field_count = feature_defn.GetFieldCount()
            
            for i in range(field_count):
                field_defn = feature_defn.GetFieldDefn(i)
                field_name = field_defn.GetName()
                field_type = field_defn.GetType()
                
                # Get field value based on type
                if field_type == ogr.OFTInteger:
                    value = feature.GetFieldAsInteger(i)
                elif field_type == ogr.OFTInteger64:
                    value = feature.GetFieldAsInteger64(i)
                elif field_type == ogr.OFTReal:
                    value = feature.GetFieldAsDouble(i)
                elif field_type == ogr.OFTString:
                    value = feature.GetFieldAsString(i)
                elif field_type == ogr.OFTDate or field_type == ogr.OFTDateTime:
                    value = feature.GetFieldAsString(i)
                elif field_type == ogr.OFTIntegerList:
                    value = feature.GetFieldAsIntegerList(i)
                elif field_type == ogr.OFTRealList:
                    value = feature.GetFieldAsDoubleList(i)
                elif field_type == ogr.OFTStringList:
                    value = feature.GetFieldAsStringList(i)
                else:
                    value = feature.GetFieldAsString(i)
                
                if value is not None:
                    properties[field_name] = value
                    property_keys.add(field_name)
            
            features.append(FeatureInfo(
                geometry=geometry_json,
                properties=properties
            ))
            
            feature = layer.GetNextFeature()
        
        # Clean up
        feature = None
        layer = None
        datasource = None
        
        return {
            "features": features,
            "feature_count": len(features),
            "available_properties": sorted(list(property_keys))
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error processing file with GDAL: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process file with GDAL: {str(e)}"
        )


def preview_file_with_gdal(file_path: str, is_directory: bool = False) -> Dict[str, Any]:
    """
    Preview geospatial file using GDAL/OGR - only extracts metadata, not full features
    
    Args:
        file_path: Path to the geospatial file
        
    Returns:
        Dictionary with feature count and available properties
    """
    if not GDAL_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="GDAL library is not available. Please install GDAL: pip install gdal or brew install gdal (macOS)"
        )
    
    try:
        # Use GDAL's auto-detection to open any supported format
        # For shapefiles, if file_path is a directory, GDAL will find the .shp file
        if is_directory:
            # For directories (like extracted shapefiles), find the .shp file
            shp_file = None
            for file in os.listdir(file_path):
                if file.lower().endswith('.shp'):
                    shp_file = os.path.join(file_path, file)
                    break
            
            if not shp_file:
                raise HTTPException(
                    status_code=400,
                    detail="No .shp file found in the directory"
                )
            datasource = ogr.Open(shp_file, 0)  # 0 = read-only
        else:
            datasource = ogr.Open(file_path, 0)  # 0 = read-only
        
        if datasource is None:
            raise HTTPException(
                status_code=400,
                detail="Failed to open file. GDAL could not recognize the file format. "
                       "Supported formats include: GeoJSON, Shapefile, KML, KMZ, GPX, and other GDAL-supported vector formats."
            )
        
        # Get the first layer
        layer_count = datasource.GetLayerCount()
        if layer_count == 0:
            raise HTTPException(status_code=400, detail="No layers found in file")
        
        layer = datasource.GetLayer(0)
        if layer is None:
            raise HTTPException(status_code=400, detail="Failed to access layer in file")
        
        # Get the spatial reference system (SRS) from the layer
        source_srs = layer.GetSpatialRef()
        
        # Create coordinate transformation to WGS84 (EPSG:4326) if needed
        target_srs = ogr.osr.SpatialReference()
        target_srs.ImportFromEPSG(4326)  # WGS84
        transform = None
        
        if source_srs:
            # Log source SRS for debugging
            try:
                srs_wkt = source_srs.ExportToWkt()
                logger.info(f"Source SRS detected: {srs_wkt[:200]}...")  # Log first 200 chars
            except:
                pass
            
            if not source_srs.IsSame(target_srs):
                # Only create transformation if SRS is different from WGS84
                try:
                    transform = ogr.osr.CoordinateTransformation(source_srs, target_srs)
                    logger.info("Coordinate transformation created successfully")
                except Exception as e:
                    logger.warning(f"Failed to create coordinate transformation: {str(e)}")
                    transform = None
            else:
                logger.info("Source SRS is already WGS84, no transformation needed")
        else:
            logger.warning("No spatial reference system found in layer - coordinates may need manual transformation")
        
        feature_count = layer.GetFeatureCount()
        
        # Check feature count limit
        if feature_count > MAX_FEATURES:
            raise HTTPException(
                status_code=400,
                detail=f"File contains {feature_count} features. Maximum allowed is {MAX_FEATURES} features."
            )
        
        # Sample a few features to extract property keys (up to 100 for performance)
        property_keys = set()
        layer.ResetReading()
        sample_count = min(100, feature_count)
        
        for _ in range(sample_count):
            feature = layer.GetNextFeature()
            if feature is None:
                break
            
            feature_defn = feature.GetDefnRef()
            field_count = feature_defn.GetFieldCount()
            
            for i in range(field_count):
                field_defn = feature_defn.GetFieldDefn(i)
                field_name = field_defn.GetName()
                property_keys.add(field_name)
            
            feature = None
        
        # Clean up
        layer = None
        datasource = None
        
        return {
            "feature_count": feature_count,
            "available_properties": sorted(list(property_keys))
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error previewing file with GDAL: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to preview file with GDAL: {str(e)}"
        )


@router.post("/preview-file", response_model=FilePreviewResponse)
async def preview_geospatial_file(
    file: UploadFile = File(..., description="Geospatial file to preview (GeoJSON, Shapefile, KML, KMZ, GPX, etc.)")
):
    """
    Preview a geospatial file using GDAL - extracts metadata only (feature count, properties).
    
    This endpoint is used to get file information before processing, so the UI can show
    a naming dialog with available properties.
    
    Args:
        file: The geospatial file to preview
        
    Returns:
        FilePreviewResponse with feature count and available properties
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    temp_file_path = None
    extract_dir = None
    try:
        content = await file.read()
        file_extension = file.filename.split(".")[-1].lower() if "." in file.filename else ""
        
        # Check if it's a ZIP file (common for shapefiles)
        if file_extension == "zip":
            # Save ZIP file temporarily
            with tempfile.NamedTemporaryFile(mode="wb", suffix=".zip", delete=False) as temp_file:
                temp_file.write(content)
                temp_file_path = temp_file.name
            
            # Extract and find shapefile
            extract_dir = await asyncio.to_thread(extract_and_find_shapefile, temp_file_path)
            result = await asyncio.to_thread(preview_file_with_gdal, extract_dir, True)
        else:
            suffix = f".{file_extension}" if file_extension else ""
            with tempfile.NamedTemporaryFile(mode="wb", suffix=suffix, delete=False) as temp_file:
                temp_file.write(content)
                temp_file_path = temp_file.name
            
            result = await asyncio.to_thread(preview_file_with_gdal, temp_file_path, False)
        
        return FilePreviewResponse(
            success=True,
            feature_count=result["feature_count"],
            available_properties=result["available_properties"],
            message=f"File contains {result['feature_count']} features"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error previewing file: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to preview file: {str(e)}"
        )
    finally:
        # Clean up temporary files and directories
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except Exception as e:
                logger.warning(f"Failed to delete temporary file: {str(e)}")
        
        if extract_dir and os.path.exists(extract_dir):
            try:
                shutil.rmtree(extract_dir)
            except Exception as e:
                logger.warning(f"Failed to delete temporary directory: {str(e)}")


@router.post("/process-file", response_model=FileProcessingResponse)
async def process_geospatial_file(
    file: UploadFile = File(..., description="Geospatial file to process (GeoJSON, Shapefile, KML, KMZ, GPX, etc.)"),
    naming_type: Optional[str] = Form(None, description="Naming type: 'prefix', 'custom', or 'property'"),
    naming_value: Optional[str] = Form(None, description="Naming value (prefix, custom name, or property key)")
):
    """
    Process a geospatial file using GDAL library with auto-detection.
    
    Supports all GDAL-supported vector formats: GeoJSON, Shapefile, KML, KMZ, GPX, etc.
    GDAL automatically detects the file format and processes it accordingly.
    Enforces a maximum of 500 features.
    
    Args:
        file: The geospatial file to process (any GDAL-supported format)
        naming_type: Optional naming configuration type
        naming_value: Optional naming configuration value
        
    Returns:
        FileProcessingResponse with features and metadata
    """
    # Validate that a file was provided
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Create temporary file to save uploaded content
    temp_file_path = None
    extract_dir = None
    try:
        # Read file content as bytes (for binary formats like Shapefile, KMZ)
        content = await file.read()
        
        # Determine file extension for temporary file naming
        # GDAL uses extension hints for format detection
        file_extension = file.filename.split(".")[-1].lower() if "." in file.filename else ""
        
        # Check if it's a ZIP file (common for shapefiles)
        if file_extension == "zip":
            # Save ZIP file temporarily
            with tempfile.NamedTemporaryFile(mode="wb", suffix=".zip", delete=False) as temp_file:
                temp_file.write(content)
                temp_file_path = temp_file.name
            
            # Extract and find shapefile
            extract_dir = await asyncio.to_thread(extract_and_find_shapefile, temp_file_path)
            result = await asyncio.to_thread(process_file_with_gdal, extract_dir, True)
        else:
            # Create temporary file with appropriate extension for GDAL
            # Use binary mode to support all file types (not just text)
            suffix = f".{file_extension}" if file_extension else ""
            with tempfile.NamedTemporaryFile(mode="wb", suffix=suffix, delete=False) as temp_file:
                temp_file.write(content)
                temp_file_path = temp_file.name
            
            # Process file with GDAL in a thread pool to avoid blocking
            # GDAL will auto-detect the format
            result = await asyncio.to_thread(process_file_with_gdal, temp_file_path, False)
        
        return FileProcessingResponse(
            success=True,
            feature_count=result["feature_count"],
            features=result["features"],
            available_properties=result["available_properties"],
            message=f"Successfully processed {result['feature_count']} features"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error processing file: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process file: {str(e)}"
        )
    finally:
        # Clean up temporary files and directories
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except Exception as e:
                logger.warning(f"Failed to delete temporary file: {str(e)}")
        
        if extract_dir and os.path.exists(extract_dir):
            try:
                shutil.rmtree(extract_dir)
            except Exception as e:
                logger.warning(f"Failed to delete temporary directory: {str(e)}")

