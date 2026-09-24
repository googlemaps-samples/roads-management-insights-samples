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

import unittest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from pydantic import ValidationError
import os
import asyncio

from server import RouteDataRequest, validate_city_name, get_route_metrics, get_hourly_aggregated_data, get_average_travel_time_by_hour
from backend.fetch_data import (
    validate_date_string,
    validate_weekdays,
    validate_bigquery_identifier,
    get_city_config,
    fetch_route_metrics,
    fetch_hourly_aggregated_data,
    fetch_average_travel_time_by_hour,
    clear_all_caches,
)


class TestRouteDataRequestValidation(unittest.TestCase):
    """Test Pydantic model validation on route data request payloads."""

    def test_valid_request(self):
        req = RouteDataRequest(
            display_names=["Route A", "Route B"],
            from_date="2024-01-01",
            to_date="2024-01-31",
            weekdays=[1, 2, 3, 4, 5],
        )
        self.assertEqual(req.from_date, "2024-01-01")
        self.assertEqual(req.to_date, "2024-01-31")
        self.assertEqual(req.weekdays, [1, 2, 3, 4, 5])
        self.assertEqual(req.display_names, ["Route A", "Route B"])

    def test_valid_empty_display_names(self):
        req = RouteDataRequest(
            display_names=[],
            from_date="2024-01-01",
            to_date="2024-01-01",
            weekdays=[1],
        )
        self.assertEqual(req.display_names, [])
        self.assertEqual(req.from_date, "2024-01-01")
        self.assertEqual(req.to_date, "2024-01-01")

    def test_sql_injection_payloads_in_from_date(self):
        attack_payloads = [
            "2024-01-01' UNION ALL SELECT ... --",
            "2024-01-01' OR '1'='1",
            "2024-01-01'; DROP TABLE routes_status; --",
            "2024-01-01'--",
            "2024-01-01\" OR \"1\"=\"1",
            "' OR 1=1 --",
            "2024-01-01\nOR 1=1",
            "2024-01-01/*comment*/",
        ]
        for payload in attack_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValidationError):
                    RouteDataRequest(
                        display_names=[],
                        from_date=payload,
                        to_date="2024-01-31",
                        weekdays=[1, 2, 3],
                    )

    def test_sql_injection_payloads_in_to_date(self):
        attack_payloads = [
            "2024-01-31' UNION ALL SELECT ... --",
            "2024-01-31' OR '1'='1",
            "2024-01-31'; DELETE FROM routes --",
            "2024-01-31'--",
            "'; DROP TABLE dataset.table; --",
        ]
        for payload in attack_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValidationError):
                    RouteDataRequest(
                        display_names=[],
                        from_date="2024-01-01",
                        to_date=payload,
                        weekdays=[1, 2, 3],
                    )

    def test_invalid_calendar_dates(self):
        invalid_dates = [
            "2024-02-30",  # Feb 30 does not exist
            "2024-02-31",  # Feb 31 does not exist
            "2024-13-01",  # Month 13
            "2024-00-10",  # Month 0
            "2024-01-32",  # Day 32
            "not-a-date",
            "2024/01/01",
            "01-01-2024",
            "2024-1-1",
        ]
        for bad_date in invalid_dates:
            with self.subTest(bad_date=bad_date):
                with self.assertRaises(ValidationError):
                    RouteDataRequest(
                        display_names=[],
                        from_date=bad_date,
                        to_date="2024-01-31",
                        weekdays=[1],
                    )

    def test_inverted_date_range_rejected(self):
        with self.assertRaises(ValidationError):
            RouteDataRequest(
                display_names=[],
                from_date="2024-02-01",
                to_date="2024-01-01",
                weekdays=[1],
            )

    def test_invalid_weekdays_rejected(self):
        invalid_weekdays = [
            [],             # empty
            [0],            # below range
            [8],            # above range
            [-1],           # negative
            [1, 2, 99],     # mixed invalid
        ]
        for bad_weekdays in invalid_weekdays:
            with self.subTest(bad_weekdays=bad_weekdays):
                with self.assertRaises(ValidationError):
                    RouteDataRequest(
                        display_names=[],
                        from_date="2024-01-01",
                        to_date="2024-01-31",
                        weekdays=bad_weekdays,
                    )

    def test_display_names_validation(self):
        # Name exceeding 256 characters
        too_long_name = "x" * 257
        with self.assertRaises(ValidationError):
            RouteDataRequest(
                display_names=[too_long_name],
                from_date="2024-01-01",
                to_date="2024-01-31",
                weekdays=[1],
            )


class TestCityNameValidation(unittest.TestCase):
    """Test city name identifier validation."""

    def test_valid_city_names(self):
        self.assertEqual(validate_city_name("GURGAON"), "GURGAON")
        self.assertEqual(validate_city_name("gurgaon"), "GURGAON")
        self.assertEqual(validate_city_name("singapore"), "SINGAPORE")
        self.assertEqual(validate_city_name("new-york_1"), "NEW-YORK_1")

    def test_malicious_city_names_rejected(self):
        malicious = [
            "../../etc/passwd",
            "GURGAON' OR '1'='1",
            "GURGAON; DROP TABLE test;",
            "GURGAON<script>",
            "GURGAON`",
            "",
            "   ",
        ]
        for bad_city in malicious:
            with self.subTest(bad_city=bad_city):
                with self.assertRaises(HTTPException) as ctx:
                    validate_city_name(bad_city)
                self.assertEqual(ctx.exception.status_code, 400)


class TestBackendValidationHelpers(unittest.TestCase):
    """Test backend helper functions for defense-in-depth validation."""

    def test_validate_date_string(self):
        self.assertEqual(validate_date_string("2024-01-01"), "2024-01-01")
        self.assertEqual(validate_date_string("2024-12-31"), "2024-12-31")

        with self.assertRaises(ValueError):
            validate_date_string("2024-01-01' UNION SELECT ... --")
        with self.assertRaises(ValueError):
            validate_date_string("2024-02-30")
        with self.assertRaises(ValueError):
            validate_date_string(12345)

    def test_validate_weekdays(self):
        self.assertEqual(validate_weekdays([1, 2, 3]), [1, 2, 3])
        self.assertEqual(validate_weekdays([7]), [7])

        with self.assertRaises(ValueError):
            validate_weekdays([])
        with self.assertRaises(ValueError):
            validate_weekdays([0])
        with self.assertRaises(ValueError):
            validate_weekdays([8])
        with self.assertRaises(ValueError):
            validate_weekdays(["1"])

    def test_validate_bigquery_identifier(self):
        self.assertEqual(validate_bigquery_identifier("my_dataset"), "my_dataset")
        self.assertEqual(validate_bigquery_identifier("my-project-123"), "my-project-123")

        with self.assertRaises(ValueError):
            validate_bigquery_identifier("dataset` UNION SELECT ... --")
        with self.assertRaises(ValueError):
            validate_bigquery_identifier("dataset; DROP TABLE t;")
        with self.assertRaises(ValueError):
            validate_bigquery_identifier("dataset name with space")

    @patch.dict(os.environ, {
        "TESTCITY_BIGQUERY_PROJECT": "valid-proj",
        "TESTCITY_BIGQUERY_HISTORICAL_DATASET": "valid_dataset",
        "TESTCITY_BIGQUERY_HISTORICAL_TABLE": "valid_historical",
        "TESTCITY_BIGQUERY_ROUTES_TABLE": "valid_routes",
        "TESTCITY_TIMEZONE": "Asia/Kolkata",
    })
    def test_get_city_config_valid(self):
        config = get_city_config("TESTCITY")
        self.assertEqual(config["bq_project"], "valid-proj")
        self.assertEqual(config["bq_historical_dataset"], "valid_dataset")
        self.assertEqual(config["timezone_name"], "Asia/Kolkata")

    @patch.dict(os.environ, {
        "TESTCITY_BIGQUERY_PROJECT": "proj` UNION SELECT ... --",
        "TESTCITY_BIGQUERY_HISTORICAL_DATASET": "valid_dataset",
        "TESTCITY_BIGQUERY_HISTORICAL_TABLE": "valid_historical",
        "TESTCITY_BIGQUERY_ROUTES_TABLE": "valid_routes",
        "TESTCITY_TIMEZONE": "Asia/Kolkata",
    })
    def test_get_city_config_malicious_env_rejected(self):
        with self.assertRaises(ValueError):
            get_city_config("TESTCITY")


class TestBigQueryParameterization(unittest.TestCase):
    """Test that queries sent to BigQuery are fully parameterized with QueryJobConfig."""

    def setUp(self):
        clear_all_caches()

    @patch("backend.fetch_data.get_city_config")
    @patch("backend.fetch_data.bigquery.Client")
    def test_fetch_route_metrics_parameterized(self, mock_bq_client_cls, mock_get_city_config):
        mock_get_city_config.return_value = {
            "bq_project": "test-project",
            "bq_historical_dataset": "test_dataset",
            "bq_historical_table": "test_historical",
            "bq_routes_table": "test_routes",
            "timezone_name": "Asia/Kolkata",
        }
        mock_client = MagicMock()
        mock_bq_client_cls.return_value = mock_client
        mock_job = MagicMock()
        mock_job.result.return_value = []
        mock_client.query.return_value = mock_job

        fetch_route_metrics(
            "TESTCITY",
            ["Route 1"],
            "2024-01-01",
            "2024-01-31",
            [1, 2, 3, 4, 5],
        )

        mock_client.query.assert_called_once()
        args, kwargs = mock_client.query.call_args
        executed_sql = args[0]
        job_config = kwargs.get("job_config")

        # 1. Verify JobConfig and Query Parameters exist
        self.assertIsNotNone(job_config)
        param_names = [p.name for p in job_config.query_parameters]
        self.assertIn("from_date", param_names)
        self.assertIn("to_date", param_names)
        self.assertIn("weekdays", param_names)
        self.assertIn("display_names", param_names)

        # 2. Verify parameter types and values
        param_map = {p.name: p for p in job_config.query_parameters}
        self.assertEqual(param_map["from_date"].value, "2024-01-01")
        self.assertEqual(param_map["to_date"].value, "2024-01-31")
        self.assertEqual(param_map["weekdays"].values, [1, 2, 3, 4, 5])
        self.assertEqual(param_map["display_names"].values, ["Route 1"])

        # 3. Verify SQL contains parameter placeholders and NOT interpolated values
        self.assertIn("BETWEEN PARSE_DATE('%Y-%m-%d', @from_date) AND PARSE_DATE('%Y-%m-%d', @to_date)", executed_sql)
        self.assertIn("IN UNNEST(@weekdays)", executed_sql)
        self.assertIn("IN UNNEST(@display_names)", executed_sql)
        self.assertNotIn("'2024-01-01'", executed_sql)
        self.assertNotIn("'2024-01-31'", executed_sql)

    @patch("backend.fetch_data.get_city_config")
    @patch("backend.fetch_data.bigquery.Client")
    def test_fetch_hourly_aggregated_data_parameterized(self, mock_bq_client_cls, mock_get_city_config):
        mock_get_city_config.return_value = {
            "bq_project": "test-project",
            "bq_historical_dataset": "test_dataset",
            "bq_historical_table": "test_historical",
            "bq_routes_table": "test_routes",
            "timezone_name": "Asia/Kolkata",
        }
        mock_client = MagicMock()
        mock_bq_client_cls.return_value = mock_client
        mock_job = MagicMock()
        mock_job.result.return_value = []
        mock_client.query.return_value = mock_job

        fetch_hourly_aggregated_data(
            "TESTCITY",
            ["Route A"],
            "2024-01-01",
            "2024-01-05",
            [1, 2, 3],
        )

        mock_client.query.assert_called_once()
        args, kwargs = mock_client.query.call_args
        executed_sql = args[0]
        job_config = kwargs.get("job_config")

        self.assertIsNotNone(job_config)
        param_names = [p.name for p in job_config.query_parameters]
        self.assertIn("from_date", param_names)
        self.assertIn("to_date", param_names)
        self.assertIn("weekdays", param_names)
        self.assertIn("display_names", param_names)

        self.assertIn("PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', CONCAT(@from_date, ' 00:00:00')", executed_sql)
        self.assertIn("PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', CONCAT(@to_date, ' 23:59:59')", executed_sql)
        self.assertIn("IN UNNEST(@weekdays)", executed_sql)
        self.assertIn("IN UNNEST(@display_names)", executed_sql)
        self.assertNotIn("'2024-01-01'", executed_sql)
        self.assertNotIn("'2024-01-05'", executed_sql)

    @patch("backend.fetch_data.get_city_config")
    @patch("backend.fetch_data.bigquery.Client")
    def test_fetch_average_travel_time_by_hour_parameterized(self, mock_bq_client_cls, mock_get_city_config):
        mock_get_city_config.return_value = {
            "bq_project": "test-project",
            "bq_historical_dataset": "test_dataset",
            "bq_historical_table": "test_historical",
            "bq_routes_table": "test_routes",
            "timezone_name": "Asia/Kolkata",
        }
        mock_client = MagicMock()
        mock_bq_client_cls.return_value = mock_client
        mock_job = MagicMock()
        mock_job.result.return_value = []
        mock_client.query.return_value = mock_job

        fetch_average_travel_time_by_hour(
            "TESTCITY",
            ["Route 1"],
            "2024-01-01",
            "2024-01-31",
            [1, 2, 3],
        )

        mock_client.query.assert_called_once()
        args, kwargs = mock_client.query.call_args
        executed_sql = args[0]
        job_config = kwargs.get("job_config")

        self.assertIsNotNone(job_config)
        self.assertIn("BETWEEN PARSE_DATE('%Y-%m-%d', @from_date) AND PARSE_DATE('%Y-%m-%d', @to_date)", executed_sql)
        self.assertIn("IN UNNEST(@weekdays)", executed_sql)
        self.assertIn("IN UNNEST(@display_names)", executed_sql)
        self.assertNotIn("'2024-01-01'", executed_sql)


class TestEndpointErrorSanitization(unittest.TestCase):
    """Test that endpoint error responses are generic and do not expose internal exceptions (CWE-209)."""

    def setUp(self):
        clear_all_caches()

    @patch("server.fetch_route_metrics")
    def test_route_metrics_error_sanitization(self, mock_fetch):
        mock_fetch.side_effect = Exception("Internal BigQuery syntax error: Table not found: secret_table")
        req = RouteDataRequest(
            display_names=[],
            from_date="2024-01-01",
            to_date="2024-01-31",
            weekdays=[1, 2, 3],
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(get_route_metrics("GURGAON", req))

        self.assertEqual(ctx.exception.status_code, 500)
        self.assertEqual(ctx.exception.detail, "Error calculating route metrics")
        self.assertNotIn("secret_table", ctx.exception.detail)
        self.assertNotIn("Internal BigQuery syntax error", ctx.exception.detail)

    @patch("server.fetch_hourly_aggregated_data")
    def test_hourly_aggregated_error_sanitization(self, mock_fetch):
        mock_fetch.side_effect = Exception("Database connection failure at 10.0.0.1:5432")
        req = RouteDataRequest(
            display_names=[],
            from_date="2024-01-01",
            to_date="2024-01-31",
            weekdays=[1, 2, 3],
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(get_hourly_aggregated_data("GURGAON", req))

        self.assertEqual(ctx.exception.status_code, 500)
        self.assertEqual(ctx.exception.detail, "Error fetching data")
        self.assertNotIn("10.0.0.1", ctx.exception.detail)

    @patch("server.fetch_average_travel_time_by_hour")
    def test_average_travel_time_error_sanitization(self, mock_fetch):
        mock_fetch.side_effect = Exception("PermissionDenied: 403 Access Denied to dataset_sensitive")
        req = RouteDataRequest(
            display_names=[],
            from_date="2024-01-01",
            to_date="2024-01-31",
            weekdays=[1, 2, 3],
        )
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(get_average_travel_time_by_hour("GURGAON", req))

        self.assertEqual(ctx.exception.status_code, 500)
        self.assertEqual(ctx.exception.detail, "Error calculating average travel time by hour")
        self.assertNotIn("dataset_sensitive", ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()
