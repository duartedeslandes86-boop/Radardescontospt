FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy

WORKDIR /app

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --break-system-packages -r requirements.txt

COPY main.py browser_bridge.py amazon_scraper.py historico.py ./

ENV HISTORICO_DB=/app/data/historico.db
RUN mkdir -p /app/data

CMD ["python", "main.py"]
