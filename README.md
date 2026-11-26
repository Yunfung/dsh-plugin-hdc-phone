# dsh-plugin-hdc-phone

[![npm](https://img.shields.io/npm/v/dsh-plugin-hdc-phone?color=4c6ef5)](https://www.npmjs.com/package/dsh-plugin-hdc-phone)
[![license](https://img.shields.io/npm/l/dsh-plugin-hdc-phone?color=2f9e44)](./LICENSE)

Drive a target HarmonyOS phone through the local HTTP bridge that a
companion app (e.g. **HdcBridge** or DSH NEXT) runs on the host. The bridge
owns `hdc`; this plugin only validates tool arguments and formats the JSON
answers, so the agent never has to shell out to `hdc` itself.

<!-- TODO: drop a screenshot of the target phone + tool call here, then uncomment
![screenshot](./assets/screenshot.png)
-->

## Features

- **7 tools**: observe the UI tree, tap by text or coordinates, swipe, back/home,
  type text, launch an ability, health-check the bridge.
- **Destructive actions are gated**: tapping 删除 / 支付 / 转账 / 卸载 / 清空 /
  退出登录 requires an explicit `confirm: true`.
- **Configurable endpoint**: env vars, a JSON config file, or the
  `phone_bridge` tool — nothing is hard-coded to one port.
- **Zero dependencies** beyond the host's `@deepseek-ai/dsh-tools`.

## Requirements

- DeepSeek Harness **>= 0.2.0-rc.1** (installed as a bundle plugin).
- Node.js **>= 24.9.0** (the DSH runtime satisfies this).
- The bridge app must be running on the host and listening on loopback.
- Target phone connected to that bridge via `hdc` (`hdc list targets` works).

## Install

```sh
# from npm
dsh plugin --profile <name> add dsh-plugin-hdc-phone

# from a local tarball
dsh plugin --profile <name> add /path/to/dsh-plugin-hdc-phone-0.3.1.tgz
```

The package ships a `cordis.patch.yml`, so installing it as a bundle
auto-registers the `hdc-phone` plugin row — no manual `cordis.yml` edit.

## Tools

| Tool | Purpose |
|---|---|
| `phone_bridge` | Show or change the bridge endpoint (`host`/`port`/`timeoutMs`) |
| `phone_observe` | Dump visible nodes of the TARGET phone (text + center coords) |
| `phone_tap` | Tap by fuzzy text or x/y; dangerous actions need `confirm:true` |
| `phone_swipe` | Swipe up / down / left / right |
| `phone_key` | Back / Home |
| `phone_input` | Type into the focused field |
| `phone_launch` | `aa start <bundle> <ability>` |
| `phone_health` | Bridge / target connectivity |

Wire protocol — the plugin POSTs to the bridge, the bridge answers:

```
POST http://<host>:<port>/tool/<observe|tap|swipe|key|input|launch|health>
```

## Bridge endpoint (port)

Resolution order:

1. Environment: `DSH_HDC_PHONE_HOST`, `DSH_HDC_PHONE_PORT`
2. Config file: `<DSH_HOME|HOME>/.dsh-hdc-phone.json`
   ```json
   { "host": "127.0.0.1", "port": 18791, "timeoutMs": 30000 }
   ```
3. Default: `127.0.0.1:18790`

Change it from the model side:

```json
{ "name": "phone_bridge", "arguments": { "port": 18791 } }
```

The bridge app must listen on the same port. On the phone both the bridge app
and DSH NEXT cannot share one port, so give one of them a different one.

## Security

The bridge binds loopback only and (in the current HdcBridge build) has no
authentication: any local app can call it. Do not expose the port to a LAN.

## Publish

```sh
npm login
npm pack
npm publish --access public
```

## License

MIT — see [LICENSE](./LICENSE).
