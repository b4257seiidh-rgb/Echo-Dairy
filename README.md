# EchoDiary

A private, browser-based diary companion. Echo asks a small number of follow-up questions, then organizes only what you shared into a diary entry. No account or backend is needed.

## Run locally

Open `index.html` in a browser, or use VS Code's Live Server extension. The app uses LocalStorage in that browser to keep entries and appearance preferences on this device.

## Privacy

Your diary stays on this device unless you choose to connect an external AI service. This first version does not send conversation text anywhere. The conversation and diary draft are created with local JavaScript rules rather than a connected AI model.

## Memory

Entries, dates, favorite status, and display preferences are stored in browser LocalStorage. Clearing browser site data removes those memories. This version keeps one entry per date; finishing a second conversation for the same day replaces that day's draft.
