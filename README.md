# MediSense AI 

**An AI-assisted healthcare web app for preliminary skin-condition analysis, medical report summarization, and digital patient records.**

> ⚠️ **Not a medical device. Not a diagnosis.** Results come from AI models and are preliminary only. They must never replace advice from a qualified doctor. A high confidence score from a model does not mean the result is correct.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?logo=vercel)](https://medisense-ai-ochre.vercel.app/)
[![Backend API](https://img.shields.io/badge/Backend-Render-purple?logo=render)](https://medisenseai-1.onrender.com/)
[![AI Service](https://img.shields.io/badge/AI%20Service-Hugging%20Face-yellow?logo=huggingface)](https://huggingface.co/spaces/Aarushi12/MediSense-AI)
[![Database](https://img.shields.io/badge/Database-MongoDB%20Atlas-green?logo=mongodb)](https://www.mongodb.com/atlas)

## 🔗 Project Links

- **Live Application:** https://medisense-ai-ochre.vercel.app/
- **Backend API:** https://medisenseai-1.onrender.com/
- **AI Service (Hugging Face Space):** https://huggingface.co/spaces/Aarushi12/MediSense-AI
- **GitHub Repository:** https://github.com/Aarushi84/MedisenseAI

##  Overview

MediSense AI is a full-stack healthcare project with separate interfaces for patients and doctors. It combines AI-assisted analysis with stored medical records and a dashboard.

Patients can submit symptoms, upload skin images for preliminary classification, upload medical PDF reports for summarization, and chat with an AI health assistant. Doctors can register patients, review records and vitals, and use AI-assisted tools.

The app uses JWT-based authentication and role-based access to separate patient and doctor features.

##  Features

###  Patient Portal

- Submit symptoms for AI-assisted preliminary analysis.
- Upload a skin image for classification (disease label and confidence score).
- Upload a text-based medical PDF and get a summary.
- View analysis results, warnings and general recommendations.
- Chat with an AI health assistant.

###  Doctor Portal

- Dashboard with patient statistics and health trends.
- Register patients manually, including walk-in patients.
- Review patient vitals, notes and available AI results.
- Use AI-assisted tools for clinical information lookup.

### Authentication and Security

- JWT-based authentication.
- Role-based authorization for patients and doctors.
- Protected API routes using backend middleware.
- MongoDB-backed storage for application data.

## Tech Stack

| Component | Technologies |
|---|---|
| Frontend | React, Tailwind CSS, Recharts |
| Backend | Node.js, Express.js, Multer, pdf-parse |
| Database | MongoDB Atlas, Mongoose |
| Authentication | JSON Web Tokens (JWT) |
| AI Service | Python, **FastAPI**, Gradio, Hugging Face Transformers |
| Symptom analysis and chat | Hugging Face Inference Providers (model set by `HF_MODEL`, default `deepseek-ai/DeepSeek-R1`) |
| PDF output | ReportLab (in the AI Space) |
| Frontend hosting | Vercel |
| Backend hosting | Render |
| AI hosting | Hugging Face Spaces |

### AI Models

These models run inside the Hugging Face Space (CPU):

- **Skin-condition classification:** `Jayanth2002/dinov2-base-finetuned-SkinDisease`, a pretrained model by another author, used as-is. It was not trained in this project.
- **Medical text summarization:** `sshleifer/distilbart-cnn-12-6`
- **Clinical reference chat:** `Qwen/Qwen2.5-1.5B-Instruct` (exposed by the Space's `/chat` endpoint)

This model runs through Hugging Face Inference Providers and is called by the Express backend:

- **Symptom analysis and the patient chat assistant:** the model in `HF_MODEL` (default `deepseek-ai/DeepSeek-R1`).

##  Architecture

```text
                  Patient / Doctor
                         |
                         v
                  React Frontend
                     (Vercel)
                         |
                         v
               Node.js + Express API
                      (Render)
              /          |           \
             v           v            v
      MongoDB Atlas   Hugging Face   Hugging Face
      Users and       Space          Inference Providers
      records         (FastAPI +     (symptom analysis
                       Gradio)        and patient chat)
```

### Request Flow

1. Users log in through the backend and receive a JWT.
2. Protected requests are checked using the token and the user's role.
3. **Skin image:** the backend receives the upload and sends it to the Space's Gradio endpoint (`/gradio_predict`) using `@gradio/client`. The Space returns a disease label and a confidence score.
4. **PDF report:** the backend extracts the text with `pdf-parse` and sends it to the Space's `/pdf-summary` endpoint.
5. **Symptom analysis, report explanation and patient chat:** the backend calls Hugging Face Inference Providers and expects a structured JSON reply (severity, summary, abnormalities, treatments, warnings, doctor advice).
6. Results are saved in MongoDB and returned to the frontend.

The doctor dashboard uses stored patient data for its charts and does not run a new AI call for each metric.

### AI Space Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /` | Health check |
| `POST /predict` | Skin image (base64) → disease and confidence |
| `POST /pdf-summary` | Report text → summary and risk level |
| `POST /chat` | Short clinical reference answer |
| `/gradio` | Gradio web UI (skin detection, report summary with PDF download, clinical assistant) |

##  Deployment

| Service | Platform | Purpose |
|---|---|---|
| Frontend | Vercel | React application |
| Backend | Render | Express API and authentication |
| AI Service | Hugging Face Spaces | FastAPI endpoints and Gradio UI |
| Database | MongoDB Atlas | Persistent application data |

##  Local Setup

### Prerequisites

- Node.js 18 or later
- Python 3.10 or later
- MongoDB Atlas account or local MongoDB
- A Hugging Face account and access token
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/Aarushi84/MedisenseAI.git
cd MedisenseAI
```

### 2. Configure the Backend

```bash
cd backend
npm install
mkdir uploads
```

The `uploads` folder is required. The backend saves uploaded files there, and Multer does not create it.

Create a `.env` file inside `backend`:

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_strong_random_secret
PORT=5000
AI_SERVICE_URL=http://localhost:7860
HF_TOKEN=your_huggingface_token
HF_MODEL=deepseek-ai/DeepSeek-R1
```

Start the backend:

```bash
node server.js
```

### 3. Run the AI Service (optional locally)

```bash
cd ai
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
python app.py
```

The service starts on port `7860` by default. The first request to each model downloads it, so the first call can be slow.

> The backend's image route connects to the hosted Space `Aarushi12/MediSense-AI` through Gradio, and it needs `HF_TOKEN` for that. To use a different Space, change the Space name in `backend/routes/reports.js`.

### 4. Configure the Frontend

```bash
cd frontend
npm install
```

Create a `.env` file inside `frontend`:

```env
REACT_APP_API_URL=http://localhost:5000
```

```bash
npm start
```

##  Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `MONGO_URI` | Backend | MongoDB connection string |
| `JWT_SECRET` | Backend | Secret for signing and verifying JWTs |
| `PORT` | Backend | Listening port |
| `AI_SERVICE_URL` | Backend | Base URL of the AI Space, used for `/pdf-summary` |
| `HF_TOKEN` | Backend | Hugging Face token for the Space call and Inference Providers |
| `HF_MODEL` | Backend | Model used for symptom analysis and patient chat |
| `REACT_APP_API_URL` | Frontend | Backend URL. Create React App reads it **at build time**, so redeploy the frontend after changing it. |

Never commit real keys, tokens, JWT secrets or database credentials.

##  Limitations

- This is a portfolio project, not a production medical system.
- AI results are preliminary and can be wrong. A confidence score is not a guarantee.
- The skin classifier is a pretrained third-party model. It is not validated for clinical use.
- The PDF risk level in the Space is a simple keyword check (for example "cancer" or "infection"), not a clinical assessment.
- Only text-based PDFs work. Scanned or image-only PDFs cannot be read.
- Symptom analysis and patient chat depend on Hugging Face Inference Providers. Free accounts have very small monthly credits. When they run out, the app shows a fallback message ("Could not generate summary") and chat shows "AI unavailable". Image classification keeps working, because it runs on the Space.
- Patient inputs are sent to third-party AI services (Hugging Face and its inference providers). Do not use real patient data.
- The AI Space allows requests from any origin (CORS `*`). Restrict this before any real use.
- Free-tier hosting causes cold starts and slow first responses.
- Uploaded files are stored on the backend's local disk, which is cleared on restarts on free hosting plans.
- Rate limiting, full request validation and automated tests are not yet in place.

##  Future Improvements

- Switch to a more reliable or cheaper provider for the summary and chat steps.
- Add rate limiting, stronger request validation and restricted CORS.
- Store uploads in cloud storage instead of local disk.
- Add automated tests and API documentation.
- Improve clinical analytics and patient history views.

##  Author

**Aarushi Singh**

- GitHub: https://github.com/Aarushi84
- LinkedIn: https://www.linkedin.com/in/aarushi-singh-43a457288/

## 📄 License

This project is licensed under the MIT License.
