from flask import Flask, request, jsonify
from flask_cors import CORS
from agriculture_assistant import load_knowledge_base, ask_question
import os

app = Flask(__name__)
CORS(app)  # Habilita CORS para todas las rutas

current_dir = os.path.dirname(os.path.abspath(__file__))
knowledge_base_path = os.path.join(current_dir, 'base_conocimiento.txt')
knowledge_base = load_knowledge_base(knowledge_base_path)

@app.route('/ask', methods=['POST'])
def ask():
    data = request.get_json()
    question = data.get('question', '')
    region = data.get('region', 'Región no especificada')

    if not question:
        return jsonify({'answer': 'Pregunta no válida.'}), 400

    # Agregar contexto de la región a la pregunta
    contextualized_question = f"Contexto de región: {region}. Pregunta: {question}"

    answer = ask_question(knowledge_base, contextualized_question)
    return jsonify({'answer': answer})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)


