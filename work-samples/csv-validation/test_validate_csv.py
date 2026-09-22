import unittest
from validate_csv import validate_csv

H = "id,description,amount\n"
class CsvTests(unittest.TestCase):
    def test_quoted_comma(self):
        self.assertEqual(validate_csv(H + '1,"Bolt, blue",2.50\n')["accepted"][0]["description"], "Bolt, blue")
    def test_multiline_description(self):
        self.assertEqual(validate_csv(H + '1,"First\nsecond",2.50\n')["accepted"][0]["description"], "First\nsecond")
    def test_bom(self):
        self.assertTrue(validate_csv("\ufeff" + H + "1,Item,1.00\n")["can_continue"])
    def test_missing_column(self):
        self.assertEqual(validate_csv(H + "1,Item\n")["rejected"][0]["reason"], "wrong_column_count")
    def test_extra_column(self):
        self.assertFalse(validate_csv(H + "1,Item,1.00,extra\n")["can_continue"])
    def test_decimal_comma_rejected(self):
        self.assertEqual(validate_csv(H + '1,Item,"1,50"\n')["rejected"][0]["reason"], "invalid_amount")
    def test_nan_rejected(self):
        self.assertFalse(validate_csv(H + "1,Item,NaN\n")["can_continue"])
    def test_duplicate(self):
        self.assertEqual(validate_csv(H + "1,Item,1.00\n1,Other,2.00\n")["rejected"][0]["reason"], "duplicate_id")
    def test_empty_file(self):
        with self.assertRaises(ValueError): validate_csv("")
    def test_header_only(self):
        self.assertFalse(validate_csv(H)["can_continue"])
    def test_duplicate_headers(self):
        with self.assertRaises(ValueError): validate_csv("id,id,amount\n")
    def test_amount_is_exact_decimal_string(self):
        self.assertEqual(validate_csv(H + "1,Item,0.10\n")["accepted"][0]["amount"], "0.10")

if __name__ == "__main__": unittest.main()
