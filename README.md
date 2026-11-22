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

## Windows Desktop & Tray Launcher (`What's up`)

To start both the Reference React app (port `3000`) and this Workbench app (`5000` in Prod, `4000` in Dev) together in the background from a single desktop icon without opening Command Prompt:

1. Run [`scripts/windows/install-whatssup.cmd`](./scripts/windows/install-whatssup.cmd) (double-click in Windows Explorer).
2. It saves two Windows User Environment Variables:
   - `WORKBENCH_APP_HOME`: path to this Workbench folder (defaults to the repo root)
   - `REF_APP_HOME`: path to your Reference React app folder (prompts via a folder picker if not already set)
   - Optional: set `REF_APP_SCRIPT` if your Reference app uses a custom npm script name instead of `prod` / `dev` / `start`.
3. It creates desktop and Start Menu shortcuts:
   - **`What's up`**: launches in **Prod** mode (`http://localhost:5000/` + Reference on `3000`) and opens your default browser homepage once ready.
   - **`What's up (Dev)`**: launches in **Dev** mode (`http://localhost:4000/` + Reference on `3000`).
4. Left-clicking the **`What's up`** system tray icon toggles **Start ↔ Stop** (stopping both apps and freeing ports `3000`, `4000`, and `5000`). Right-clicking the tray icon lets you switch between Prod (`5000`) and Dev (`4000`), open the homepage, inspect logs (`%LOCALAPPDATA%\FluentAssistantWorkbench\launcher\logs`), or reconfigure folders.
5. **Uninstall**: Double-click [`scripts/windows/uninstall-whatssup.cmd`](./scripts/windows/uninstall-whatssup.cmd) to stop any active tray/app processes, delete the Desktop/Start Menu shortcuts, clean up `%LOCALAPPDATA%\FluentAssistantWorkbench\launcher`, and clear `WORKBENCH_APP_HOME` / `REF_APP_HOME` without touching your source code or saved reports.
