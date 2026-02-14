# Run the FastAPI backend from the backend directory so uvicorn finds app:app
Set-Location $PSScriptRoot
uvicorn app:app --reload --host 127.0.0.1 --port 8000
