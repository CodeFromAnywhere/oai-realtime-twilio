# OpenAI Realtime Voice2Voice Twilio Agent

This is a POC of Twilio Integration with OpenAI, hosted on CloudFlare Workers.

## Installation

```
npm install -g wrangler
git clone https://github.com/CodeFromAnywhere/oai-realtime-twilio.git
cd oai-realtime-twilio
cp wranger.toml.example wrangler.toml # fill in the token here
wrangler deploy
```

Add the resulting `*.workers.dev` URL as a webhook URL of your twilio phone number.

Done!

## Usage

Call your Twilio phone number
