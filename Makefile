.PHONY: dev backend run serve health

## One-click dev server (Flask serves static + API)
run: backend

## Start Flask backend (port 5000)
backend:
	python backend/server.py

## Start Vite dev server (frontend only, port 5173)
dev:
	npx vite

## Preview Vite production build
preview:
	npx vite preview

## Check if server is responding
health:
	@curl -s http://localhost:5000/api/health | python -m json.tool

## Install Python dependencies
install:
	pip install -r backend/requirements.txt

## Install Node dependencies
install-node:
	npm install
