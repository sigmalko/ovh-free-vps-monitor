FROM node:22-alpine

# tzdata — żeby CRON_SCHEDULE działał w wybranej strefie czasowej (TZ).
RUN apk add --no-cache tzdata

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY docker/entrypoint.sh docker/run-monitor.sh /usr/local/bin/
# sed: zabezpieczenie na wypadek końcówek linii CRLF po checkoucie na Windowsie.
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh /usr/local/bin/run-monitor.sh \
 && chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/run-monitor.sh

ENV CRON_SCHEDULE="*/10 * * * *" \
    TZ=Europe/Warsaw

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
