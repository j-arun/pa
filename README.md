# Fluent Personal Assistant

## Configuration and local data

### Windows configuration file

The Windows native app and the locally hosted web app use this settings file by default:

`%LOCALAPPDATA%\FluentAssistantWorkbench\workbench.config.json`

For example:

`C:\Users\<username>\AppData\Local\FluentAssistantWorkbench\workbench.config.json`

The `promptBuilder` section stores the selected domain and style, plus Formal and Classic templates for the four tabs: Career & Profession (Astrology), Health & Vitality (Health), Family & Domestic Life (Finance), and Love & Relationships (General). The file also stores other workbench settings, including appearance, model configuration, and context-cache text. Treat it as private and do not commit or share it.

The native app stores conversation history separately in:

`%LOCALAPPDATA%\FluentAssistantWorkbench\conversation.json`

### Browser storage

The web app also keeps browser-local data, scoped to the browser profile and app origin:

- `fluent_paw_settings_v1`: settings, including prompt-builder templates.
- `fluent_paw_conversation_v1`: browser conversation history.
- `fluent_paw_scope_v1`: selected conversation scope.

When the local web server is running, web settings are also synchronized to `workbench.config.json` through `/api/config`. Older browser profiles may contain separate legacy prompt-builder keys.

### Storage location overrides

The local web server accepts `WORKBENCH_DATA_DIR` to choose a different directory for `workbench.config.json`. Without it, Windows uses `%LOCALAPPDATA%\FluentAssistantWorkbench`; on other platforms, the default is `.workbench-local` under the server's working directory. The native app uses `%LOCALAPPDATA%\FluentAssistantWorkbench`.

Provider environment-variable examples are listed in [`.env.example`](./.env.example). Keep actual credentials in environment variables or another private store; do not commit secrets.

Built-in defaults are defined in [WorkbenchModels.cs](./FluentAssistantWorkbench/Models/WorkbenchModels.cs) for the native app and [promptTemplates.ts](./src/utils/promptTemplates.ts) for the web app. Edits made in the apps are saved in the settings locations described above.
