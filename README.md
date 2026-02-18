# Wallpaper API (Docker)

一个可容器化部署的壁纸 API。  
从挂载目录读取图片，按最近比例匹配并随机返回，支持“短期不重复”开关。

## 功能

- `GET /api/wallpaper`：返回 `302` 重定向到图片资源地址
- 支持比例输入：`width + height` 或 `aspect`
- 无输入时：先按 `User-Agent` 粗分；不可靠时走“电脑倾向”
- 电脑倾向比例来自库存主流横屏比例（不写死 `16:9`）
- 防重复支持开关：`DEDUP_ENABLED`
- 防重复窗口：`DEDUP_WINDOW`（默认 20）
- 分类支持：按一级文件夹名作为 `category`

## 目录结构建议

```text
。
├─ docker-compose.yml
├─ Dockerfile
├─ src/
└─ wallpapers/
   ├─ anime/
   │  ├─ a.jpg
   │  └─ b.png
   ├─ nature/
   │  └─ c.webp
   └─ d.jpg
```

根目录图片会被归入 `uncategorized`。

## 启动

1. 复制配置文件并修改：

```bash
cp .env.example .env
```

2. 准备壁纸目录：

```bash
mkdir -p wallpapers
```

3. 启动：

```bash
docker compose up -d --build
```

## 配置项

- `API_TOKEN`：接口 Token，使用 Bearer 鉴权。如果空着则不开启鉴权。
- `BASE_URL`：对外访问地址（例如 `https://img.example.com`）
- `SCAN_INTERVAL_SEC`：目录重扫间隔（秒）
- `DEDUP_ENABLED`：是否启用防重复（`true/false`）
- `DEDUP_WINDOW`：最近 N 张不重复
- `TOP_K`：最近比例候选池大小
- `RATE_LIMIT_RPS`：每个 IP 每秒允许的请求数（`0` 表示关闭限流，默认 `10`）
- `UA_TRUST_MODE`：`auto/always/never`

## 接口说明

### 1) 健康检查

`GET /api/health`

示例响应：

```json
{
  "ok": true,
  "totalCount": 200,
  "categories": ["anime", "nature", "uncategorized"],
  "dedup": {
    "enabled": true,
    "window": 20,
    "keysInMemory": 3
  }
}
```

### 2) 获取壁纸

`GET /api/wallpaper`

Header:

```text
Authorization: Bearer <API_TOKEN>
```

Query 参数（全部可选）：

- `width`、`height`：优先级最高
- `aspect`：如 `9:19.5` 或 `0.462`
- `category`：按目录分类筛选
- `client_id`：同一客户端标识（推荐，去重更准确）

示例：

```bash
curl -i "http://localhost:8080/api/wallpaper?width=1179&height=2556&client_id=phone-001" \
  -H "Authorization: Bearer replace-with-strong-token"
```

成功返回 `302`，`Location` 指向 `/assets/...` 或 `BASE_URL/assets/...`。

## 限流策略

- 作用范围：`GET /api/wallpaper`
- 维度：按客户端 IP 统计
- 窗口：固定 1 秒窗口
- 超限返回：`429` + `{ "error": "too_many_requests", "limitPerSecond": <配置值> }`

## 去重策略

- `DEDUP_ENABLED=false`：关闭去重，纯随机（仍按比例匹配）
- `DEDUP_ENABLED=true`：
  - 优先按 `client_id` 去重
  - 若缺失 `client_id`，降级按 IP 去重
  - 候选不足时自动放宽窗口和候选池，保证可返回
