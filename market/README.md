# 私有插件市场（本地索引 + 只读 npm registry）

这个目录能把 `dsh-plugin-hdc-phone` 变成"像市场里那样一键安装"的包，全程离线：

- `public/dsh-index.json` —— 市场索引（format 1），符合 `@deepseek-ai/dsh-plugin-market-index` 的校验规则；
- `public/registry/<name>.json` —— npm packument（含 tarball 地址、sha1/integrity）；
- `public/registry/tarballs/<name>-<version>.tgz` —— 真正的包体（`pnpm pack` 产物）；
- `serve.mjs` —— 零依赖只读 HTTP 服务，同时提供索引和 registry 两个入口。

## 1. 打包 + 生成索引

```powershell
# 用 DSH 自带 runtime 的 node / pnpm（PATH 里通常没有）
$NODE = "C:\Users\fengy\.dsh\dsh-runtimes\dsh-next-primary-runtime\dependencies\node\bin\node.exe"
$PNPM = "C:\Users\fengy\.dsh\dsh-runtimes\dsh-next-primary-runtime\dependencies\pnpm\bin\pnpm.cjs"
$env:PNPM_CJS = $PNPM
& $NODE market\build.mjs
```

产物会写到 `market/public/**`，命令会打印三个 URL（索引 / packument / tarball）和 tgz 大小与校验值。
可用环境变量：`PNPM_CJS`（pnpm.cjs 路径，必需）、`MARKET_URL`（写进索引里的 registry 前缀，默认 `http://127.0.0.1:18792/`）。

> 改了端口或想换机器分享时，先设 `MARKET_URL` 再 build，索引里的 `source.registry` 会跟着变。

## 2. 起服务

双击 `serve.cmd`，或者：

```powershell
$env:MARKET_PORT = "18792"   # 可选，默认 18792
& $NODE market\serve.mjs
```

路由：

| 路径 | 内容 |
| --- | --- |
| `/` `/index.json` `/dsh-index.json` | 市场索引 |
| `/registry/<name>` | packument |
| `/registry/<name>/-/<file>.tgz` | tarball |

tarball 在磁盘上存放在 `public/registry/tarballs/`，由服务按 npm 约定路由映射过去（避免 `<pkg>` 文件与 `<pkg>/-/` 目录同名冲突）。

## 3. 挂到 DSH 的插件市场

编辑 profile 配置 `C:\Users\fengy\.dsh\profiles\desktop\cordis.patch.yml`，给 `plugin-market` 的 `config.indexes` 追加一行：

```yaml
- id: plugin-market
  name: "@deepseek-ai/dsh-plugin-market"
  config:
    indexes:
      - https://realguan.github.io/dsh-plugin-market/dsh-index.json
      - http://127.0.0.1:18792/dsh-index.json      # ← 本地私有索引
```

刷新/重启桌面端后在插件市场里就能看到 `Hdc Phone`（分类 remote）。
索引 URL 必须是 http/https 绝对地址（`file:` 会被 `plugin-market/invalid-index-url` 拒绝）。

## 4. 不经过市场，直接装

私有 registry 是标准 npm registry，pnpm 可以直接消费：

```powershell
cd <任意空目录>
"registry=http://127.0.0.1:18792/registry/`nauto-install-peers=false" | Set-Content .npmrc -Encoding ascii
& $NODE $PNPM add dsh-plugin-hdc-phone@0.3.1
```

装完 `node_modules/dsh-plugin-hdc-phone` 里应当只有 `package.json`、`cordis.patch.yml`、`README.md`、`src/index.js`（`files` 白名单控制）。

## 5. 与设备/HAP 的关系

`market\` 只是**分发**用，不参与 HAP 打包。设备上真正加载的仍是
`app\entry\src\main\resources\resfile\plugins\dsh-plugin-hdc-phone\`（见仓库 `AGENTS.md` §4.2），
改完插件要重新构建 HAP 才会在手机上生效。

## 已修复的坑

- packument 必须同时带 `peerDependencies` 和 `peerDependenciesMeta`：只写前者时 pnpm 会尝试安装
  `@deepseek-ai/dsh-tools` 并因私有 registry 没有该包而报 `ERR_PNPM_FETCH_404`。
- `peerDependenciesMeta.*.optional = true` 让这两个宿主内建包不被安装（设备端 core 里已自带）。
