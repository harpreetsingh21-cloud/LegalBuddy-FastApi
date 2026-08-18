import subprocess
import os
import sys

os.chdir(r"C:\download pdf college\MCA pankaj new project\legalbuddy\backend")
os.environ["PYTHONPATH"] = "."

services = [
    ("Auth",     ["python", "-m", "uvicorn", "services.auth_service.main:app",     "--host", "0.0.0.0", "--port", "8001"]),
    ("Document", ["python", "-m", "uvicorn", "services.document_service.main:app", "--host", "0.0.0.0", "--port", "8002"]),
    ("RAG",      ["python", "-m", "uvicorn", "services.rag_service.main:app",        "--host", "0.0.0.0", "--port", "8003"]),
    ("Gateway",  ["python", "-m", "uvicorn", "services.api_gateway.main:app",       "--host", "0.0.0.0", "--port", "5000"]),
]

processes = []
for name, cmd in services:
    p = subprocess.Popen(cmd)
    
    print(f"🚀 {name} Service started on port {cmd[-1]}")
    processes.append(p)

print("\n✅ All 4 services running! Press Ctrl+C to stop all.\n")
try:
    for p in processes:
        p.wait()
except KeyboardInterrupt:
    print("\n🛑 Stopping all services...")
    for p in processes:
        p.terminate()