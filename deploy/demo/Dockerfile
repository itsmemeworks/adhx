# The public ADHX demo (see README.md here). Built from the repository root:
#   docker build -f deploy/demo/Dockerfile -t adhx-demo .
# ADHX_IMAGE must be a release with demo mode in it.
ARG ADHX_IMAGE=ghcr.io/itsmemeworks/adhx:latest
FROM ${ADHX_IMAGE}
COPY --chown=nextjs:nodejs e2e/parity /app/e2e/parity
COPY --chown=nextjs:nodejs site/public/media /app/site/public/media
COPY --chown=nextjs:nodejs deploy/demo /app/deploy/demo
EXPOSE 8080
CMD ["sh", "/app/deploy/demo/start.sh"]
