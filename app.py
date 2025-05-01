import os
import google.generativeai as genai
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import re # Import regular expressions for parsing

# Load environment variables (especially API Key)
load_dotenv()

app = Flask(__name__)

# Configure Gemini API
try:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in environment variables.")
    genai.configure(api_key=api_key)
    # Use gemini-1.0-pro for potentially better performance/features
    model = genai.GenerativeModel('gemini-1.5-flash')
except Exception as e:
    print(f"Error configuring Gemini: {e}")
    # Handle this more gracefully in a real app (e.g., disable generation)
    model = None

# Define Turkish regions
TURKISH_REGIONS = [
    "Ege Bölgesi",
    "Akdeniz Bölgesi",
    "Karadeniz Bölgesi",
    "İç Anadolu Bölgesi",
    "Doğu Anadolu Bölgesi",
    "Güneydoğu Anadolu Bölgesi",
    "Marmara Bölgesi"
]

def parse_gemini_response(text):
    """
    Attempts to parse the Gemini response text into a structured dictionary.
    Relies on the AI following the prompt's format.
    """
    recipe = {
        "title": "Tarif Başlığı Bulunamadı",
        "ingredients": ["Malzemeler ayrıştırılamadı."],
        "instructions": "Hazırlanış adımları ayrıştırılamadı.",
        "regional_note": "Bölgesel not bulunamadı."
    }
    try:
        # Use regex to find sections, case-insensitive and allowing space after colon
        title_match = re.search(r"Başlık:\s*(.*)", text, re.IGNORECASE)
        ingredients_match = re.search(r"Malzemeler:\s*\n(.*?)\nHazırlanışı:", text, re.IGNORECASE | re.DOTALL)
        instructions_match = re.search(r"Hazırlanışı:\s*\n(.*?)(\nBölgesel Not:|\Z)", text, re.IGNORECASE | re.DOTALL)
        note_match = re.search(r"Bölgesel Not:\s*(.*)", text, re.IGNORECASE | re.DOTALL)

        if title_match:
            recipe["title"] = title_match.group(1).strip()

        if ingredients_match:
            # Split ingredients by newline, remove empty lines and leading '-' or '*'
            ingredients_list = ingredients_match.group(1).strip().split('\n')
            recipe["ingredients"] = [re.sub(r"^\s*[-*]\s*", "", item).strip() for item in ingredients_list if item.strip()]
            if not recipe["ingredients"]: # Fallback if splitting failed badly
                 recipe["ingredients"] = [ingredients_match.group(1).strip()]


        if instructions_match:
            # Strip leading/trailing whitespace and potentially remove step numbers if needed
             recipe["instructions"] = instructions_match.group(1).strip()


        if note_match:
             recipe["regional_note"] = note_match.group(1).strip()

    except Exception as e:
        print(f"Error parsing Gemini response: {e}")
        # Return the raw text if parsing fails completely
        recipe["instructions"] = f"Ayrıştırma hatası oluştu. Ham metin:\n{text}"

    return recipe


@app.route('/')
def index():
    return render_template('index.html', regions=TURKISH_REGIONS)

@app.route('/api/generate-recipe', methods=['POST'])
def generate_recipe_api():
    if not model:
         return jsonify({"error": "AI Modeli yapılandırılamadı."}), 500

    data = request.get_json()
    if not data or 'ingredients' not in data or 'region' not in data:
        return jsonify({"error": "Eksik veri: 'ingredients' ve 'region' gerekli."}), 400

    ingredients = data['ingredients']
    region = data['region']

    if not ingredients:
         return jsonify({"error": "Lütfen en az bir malzeme girin."}), 400
    if region not in TURKISH_REGIONS:
         return jsonify({"error": "Geçersiz bölge seçimi."}), 400

    ingredients_text = ", ".join(ingredients)

    # --- The Crucial Gemini Prompt ---
    prompt = f"""
Sen Türk yöresel mutfakları konusunda uzman, yaratıcı bir aşçı yapay zekasın. Sana vereceğim malzeme listesi ve bir Türk bölgesi ismiyle, o bölgenin mutfak tarzına uygun, lezzetli ve mantıklı bir yemek tarifi oluşturmanı istiyorum. Sadece verilen malzemeleri kullanmaya çalış, ancak gerekirse çok temel eklemeler (tuz, karabiber, yağ, su gibi) yapabilirsin.

Malzemeler: {ingredients_text}
Bölge: {region}

Cevabını mutlaka Türkçe olarak ve SADECE aşağıdaki formatta ver. Başka hiçbir açıklama veya giriş cümlesi ekleme:

Başlık: [Yemek Adı]
Malzemeler:
- [Malzeme 1]
- [Malzeme 2]
...
Hazırlanışı:
1. [Adım 1]
2. [Adım 2]
...
Bölgesel Not: [Bu tarifin neden seçilen bölgeye (örn: {region}) ait sayılabileceğine veya o bölgenin hangi özelliklerini yansıttığına dair kısa, 1-2 cümlelik bir açıklama.]
"""

    try:
        # Set safety settings to try and avoid overly restrictive blocks for food
        # Experiment with these if you get blocked responses often
        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        ]

        response = model.generate_content(prompt, safety_settings=safety_settings)

        # Check for blocked response
        if not response.parts:
             # Try to find the reason if available
            block_reason = "İçerik güvenlik filtreleri tarafından engellendi."
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                block_reason += f" Sebep: {response.prompt_feedback.block_reason}"
            print(f"Gemini Response Blocked: {response.prompt_feedback}")
            return jsonify({"error": block_reason}), 500


        # --- Parse the response ---
        recipe_data = parse_gemini_response(response.text)
        # ---

        return jsonify({"recipe": recipe_data})

    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        # Check if it's a specific Gemini API error (you might need to inspect the exception type)
        # if isinstance(e, google.api_core.exceptions.ResourceExhausted):
        #     return jsonify({"error": "API kota limiti aşıldı. Lütfen daha sonra tekrar deneyin."}), 429
        return jsonify({"error": f"Tarif oluşturulurken bir hata oluştu: {e}"}), 500

if __name__ == '__main__':
    # Port 5000 is common for Flask dev, Render might assign its own port
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
