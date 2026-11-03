FROM alpine:3.21

RUN apk --no-cache add tzdata ffmpeg python3 py3-pip

ENV TZ=America/Los_Angeles
ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=main.py

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt

COPY . /app

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "900", "main:app"]
