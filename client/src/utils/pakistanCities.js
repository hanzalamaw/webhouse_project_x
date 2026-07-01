/** Major cities and towns across Pakistan (provinces). */
export const PAKISTAN_CITIES = [
  "Abbottabad", "Ahmadpur East", "Arifwala", "Attock", "Badin", "Bagh", "Bahawalnagar", "Bahawalpur",
  "Bannu", "Battagram", "Burewala", "Chakwal", "Charsadda", "Chiniot", "Chishtian", "Chitral",
  "Dadu", "Daska", "Dera Ghazi Khan", "Dera Ismail Khan", "Faisalabad", "Ghotki", "Gilgit",
  "Gojra", "Gujar Khan", "Gujranwala", "Gujrat", "Hafizabad", "Hangu", "Haripur", "Hasilpur",
  "Havelian", "Hyderabad", "Islamabad", "Jacobabad", "Jaranwala", "Jatoi", "Jhang", "Jhelum",
  "Kamoke", "Kamalia", "Karachi", "Kasur", "Khairpur", "Khanewal", "Khanpur", "Khushab",
  "Kohat", "Kot Addu", "Kotri", "Lahore", "Lakki Marwat", "Larkana", "Layyah", "Lodhran",
  "Loralai", "Mandi Bahauddin", "Mansehra", "Mardan", "Matiari", "Mian Channu", "Mianwali",
  "Mingora", "Mirpur", "Mirpur Khas", "Multan", "Muridke", "Muzaffarabad", "Muzaffargarh",
  "Nankana Sahib", "Narowal", "Nawabshah", "Nowshera", "Okara", "Pakpattan", "Peshawar",
  "Quetta", "Rahim Yar Khan", "Rajanpur", "Rawalpindi", "Sadiqabad", "Sahiwal", "Sargodha",
  "Sheikhupura", "Shikarpur", "Sialkot", "Skardu", "Sukkur", "Swabi", "Swat", "Talagang",
  "Tando Adam", "Tando Allahyar", "Taxila", "Thatta", "Toba Tek Singh", "Turbat", "Umerkot",
  "Vehari", "Wah Cantonment", "Wazirabad",
].sort((a, b) => a.localeCompare(b));

export const PAKISTAN_CITY_OPTIONS = PAKISTAN_CITIES.map((city) => ({
  value: city,
  label: city,
}));
