<div align="center">

# ⚖️ LegalBuddy — AI-Powered Legal Document Intelligence Platform

**Analyze Indian corporate legal documents in seconds using RAG + Local LLMs**

[![FastAPI](https://img.shields.io/badge/FastAPI-5.0.0-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python)](https://www.python.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb)](https://www.mongodb.com/)
[![Ollama](https://img.shields.io/badge/Ollama-qwen3:1.7b-FF6B35?style=flat-square)](https://ollama.com/)
[![FAISS](https://img.shields.io/badge/FAISS-Vector_Search-4285F4?style=flat-square)](https://faiss.ai/)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)

---

## 🧠 Overview

**LegalBuddy** is a full-stack AI platform that enables lawyers, compliance officers, and corporate teams to instantly analyze legal documents against the **Indian Companies Act 2013** and 50+ corporate law frameworks. Upload a PDF, DOCX, or TXT — and get a structured breakdown of clauses, obligations, risks, and compliance status in seconds.

### How It Works
1. **Upload:** User submits PDF, DOCX, or TXT.
2. **Extraction:** Text parsed via `pdfplumber`, `PyPDF2`, or `python-docx`.
3. **Indexing:** Local chunking and FAISS vector embeddings (`all-MiniLM-L6-v2`).
4. **Retrieval:** Dual-search across local document context and global Companies Act knowledge base.
5. **Inference:** Structured analysis generated via local Ollama LLM (`qwen3:1.7b`).

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🔐 **JWT Authentication** | Secure auth with bcrypt password hashing |
| 📄 **Multi-format Upload** | Supports PDF, DOCX, and TXT files |
| 🧠 **RAG Pipeline** | Dual FAISS search (Document-local + Global Law KB) |
| ⚖️ **52 Clause Types** | Detects indemnification, force majeure, arbitration, PF/ESIC, etc. |
| 🇮🇳 **Indian Law Context** | Built-in Companies Act & DPDP Act compliance checking |

---

## 🛠️ Tech Stack

- **Backend:** FastAPI, MongoDB Atlas, Motor, PyJWT, Ollama, FAISS, SentenceTransformers
- **Frontend:** React 19, Vite 7, Tailwind CSS v4, Zustand 5, Framer Motion
