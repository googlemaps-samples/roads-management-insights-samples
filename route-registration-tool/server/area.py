# Constants
lat_to_km = 111  # 1 degree of latitude is roughly 111 km
lon_to_km_at_lat = 96  # 1 degree of longitude at latitude 28.4° N is roughly 96 km

# Coordinates for the bounding box
lat1 = 28.4
lat2 = 28.403
lon1 = 77.1
lon2 = 77.103

# Latitude difference (height of rectangle in degrees)
lat_diff = lat2 - lat1

# Longitude difference (width of rectangle in degrees)
lon_diff = lon2 - lon1

# Convert degrees to kilometers
height_km = lat_diff * lat_to_km
width_km = lon_diff * lon_to_km_at_lat

# Calculate the area of the rectangle in km^2
area_km2 = height_km * width_km
print(f"The area of the rectangle is {area_km2} square kilometers.")

# {
#     "origin": {
#       "location": {
#         "latLng": {
#           "latitude": 28.2825814,
#           "longitude": 76.8547294
#         }
#       }
#     },
#     "destination": {
#       "location": {
#         "latLng": {
#           "latitude": 28.2427033,
#           "longitude": 76.8130788
#         }
#       }
#     },
#     "intermediates": [
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2775818,
#             "longitude": 76.8472173
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2759042,
#             "longitude": 76.8442993
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2731794,
#             "longitude": 76.8396504
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2720712,
#             "longitude": 76.8377079
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2715969,
#             "longitude": 76.8368924
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2711872,
#             "longitude": 76.8362262
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2695736,
#             "longitude": 76.8333828
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2675494,
#             "longitude": 76.8317292
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2666196,
#             "longitude": 76.8313151
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2640975,
#             "longitude": 76.8302042
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2621074,
#             "longitude": 76.829088
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.259504,
#             "longitude": 76.8265263
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2565466,
#             "longitude": 76.8235361
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2524992,
#             "longitude": 76.8204121
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.247345,
#             "longitude": 76.8166184
#           }
#         }
#       },
#       {
#         "location": {
#           "latLng": {
#             "latitude": 28.2464735,
#             "longitude": 76.8159074
#           }
#         }
#       }
#     ],
#     "travelMode": "DRIVE",
#     "extraComputations": [
#       "TRAFFIC_ON_POLYLINE"
#     ],
#     "routingPreference": "TRAFFIC_AWARE_OPTIMAL",
#     "routeModifiers": {
#       "vehicleInfo": {
#         "emissionType": "GASOLINE"
#       }
#     },
#     "languageCode": "en-US"
#   }


# "AIzaSyA7qsmMhrA5sQig7WiE9EhnnVBKJD_uDI4"