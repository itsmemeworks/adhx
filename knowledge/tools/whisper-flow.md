---
title: "Whisper Flow"
type: tool
date_added: 2026-01-02
source: "https://github.com/dimastatz/whisper-flow"
tags: [speech-to-text, real-time, transcription, whisper, python]
via: "Twitter bookmark from @tom_doerr"
---

Whisper Flow is a Python framework for real-time audio transcription using OpenAI's Whisper model. Unlike traditional batch processing where entire files are uploaded and transcribed, Whisper Flow accepts continuous streams of audio chunks and produces incremental transcripts immediately.

Implements tumbling window approach for streaming, delivering partial results as speech is being processed, with final results when speech segments complete.

## Key Features

- Real-time streaming audio transcription
- Incremental partial results during speaking
- Configurable window-based audio chunking
- Word Error Rate (WER) benchmarking support
- Sub-second latency targets
- LibriSpeech benchmark compatible

## Technologies

- Python/PyPI package
- OpenAI Whisper integration
- Streaming architecture
- Speech-to-text optimization

## Use Cases

- Live transcription of meetings or streams
- Real-time accessibility features
- Live captioning systems
- Audio processing automation

## Links

- [GitHub Repository](https://github.com/dimastatz/whisper-flow)
- [Original Tweet](https://x.com/tom_doerr/status/2006262985182834881)
