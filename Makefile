.PHONY: setup run-backend run-mobile test clean

setup:
	@echo "Setting up environment..."
	python3 -m venv venv
	. venv/bin/activate && pip install -r requirements.txt
	@echo "Please configure .env file"

run-backend:
	@echo "Starting Backend..."
	docker-compose up --build

run-mobile:
	@echo "Starting Mobile App..."
	cd nust_sas_mobile && flutter run

test:
	@echo "Running Tests..."
	. venv/bin/activate && pytest

clean:
	@echo "Cleaning up..."
	rm -rf venv
	find . -type d -name "__pycache__" -exec rm -rf {} +
