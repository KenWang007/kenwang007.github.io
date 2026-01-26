---
slug: api-gateway-guide
title: 🚪 API 网关设计指南
---

# 🚪 API 网关设计指南

## 1. 为什么需要网关？

### 1.1 没有网关的问题

```
传统架构（无网关）：

    ┌──────────┐     ┌─────────────┐
    │  Client  │────→│  Service A  │
    └──────────┘     └─────────────┘
         │           ┌─────────────┐
         ├──────────→│  Service B  │
         │           └─────────────┘
         │           ┌─────────────┐
         └──────────→│  Service C  │
                     └─────────────┘

问题：
• 客户端需要知道所有服务地址
• 每个服务都要实现认证、限流、日志
• 跨域、协议转换等重复处理
• 服务变更客户端需要同步修改
• 安全边界模糊，攻击面大
```

### 1.2 网关解决的核心问题

| 问题 | 网关解决方案 |
|------|-------------|
| **统一入口** | 单一访问点，屏蔽后端复杂性 |
| **安全边界** | 集中认证授权，减少攻击面 |
| **流量管控** | 限流、熔断、负载均衡 |
| **协议转换** | HTTP/gRPC/WebSocket 互转 |
| **请求聚合** | BFF 模式，减少客户端请求次数 |
| **监控审计** | 统一日志、链路追踪、指标采集 |
| **灰度发布** | 按规则路由到不同版本 |

### 1.3 网关架构

```
┌─────────────────────────────────────────────────────────┐
│                     API Gateway                         │
├─────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │  认证   │ │  限流   │ │  路由   │ │  监控   │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │  缓存   │ │  熔断   │ │  转换   │ │  日志   │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Service A  │ │  Service B  │ │  Service C  │
└─────────────┘ └─────────────┘ └─────────────┘
```

---

## 2. 网关在分布式系统中的应用

### 2.1 核心功能

#### 路由与负载均衡

```csharp
// YARP 路由配置示例
{
  "ReverseProxy": {
    "Routes": {
      "orders-route": {
        "ClusterId": "orders-cluster",
        "Match": { "Path": "/api/orders/{**catch-all}" }
      },
      "users-route": {
        "ClusterId": "users-cluster",
        "Match": { "Path": "/api/users/{**catch-all}" }
      }
    },
    "Clusters": {
      "orders-cluster": {
        "LoadBalancingPolicy": "RoundRobin",
        "Destinations": {
          "d1": { "Address": "http://orders-service-1:5000" },
          "d2": { "Address": "http://orders-service-2:5000" }
        }
      }
    }
  }
}
```

#### 认证与授权

```csharp
// JWT 认证中间件
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://identity-server";
        options.Audience = "api-gateway";
    });

// 网关统一验证，下游服务信任网关
app.UseAuthentication();
app.UseAuthorization();
```

#### 限流与熔断

```csharp
// 使用 Polly 实现熔断
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(context =>
    {
        context.AddRequestTransform(async transformContext =>
        {
            // 添加限流逻辑
            await _rateLimiter.WaitAsync(transformContext.HttpContext.RequestAborted);
        });
    });
```

#### 请求聚合（BFF 模式）

```csharp
// GraphQL 聚合多个服务
public class Query
{
    public async Task<OrderWithUser> GetOrderDetail(
        [Service] IOrderService orderService,
        [Service] IUserService userService,
        int orderId)
    {
        var order = await orderService.GetOrderAsync(orderId);
        var user = await userService.GetUserAsync(order.UserId);
        
        return new OrderWithUser { Order = order, User = user };
    }
}
```

### 2.2 常见架构模式

#### 单一网关

```
适用：中小型系统
         ┌──────────┐
         │ Gateway  │
         └────┬─────┘
    ┌─────────┼─────────┐
    ▼         ▼         ▼
  Users    Orders    Products
```

#### 多网关（按客户端分）

```
适用：多端应用（Web/Mobile/第三方）

  Web Client    Mobile App    Partner API
       │             │             │
       ▼             ▼             ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Web GW   │  │Mobile GW │  │Partner GW│
└────┬─────┘  └────┬─────┘  └────┬─────┘
     └─────────────┼─────────────┘
                   ▼
            Internal Services
```

#### 网关 + Service Mesh

```
适用：大型微服务系统

Client → API Gateway → [Service Mesh (Istio/Linkerd)]
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         ┌────────┐      ┌────────┐      ┌────────┐
         │Sidecar │      │Sidecar │      │Sidecar │
         │   +    │      │   +    │      │   +    │
         │Service │      │Service │      │Service │
         └────────┘      └────────┘      └────────┘
```

### 2.3 网关 vs Service Mesh

| 功能 | API Gateway | Service Mesh |
|------|-------------|--------------|
| **流量入口** | ✅ 南北向流量 | ❌ 主要东西向 |
| **认证授权** | ✅ 外部认证 | ✅ 服务间 mTLS |
| **限流熔断** | ✅ 入口级别 | ✅ 服务级别 |
| **协议转换** | ✅ | ❌ |
| **请求聚合** | ✅ | ❌ |
| **可观测性** | ✅ 入口级别 | ✅ 全链路 |
| **部署复杂度** | 低 | 高 |

---

## 3. .NET 网关实现方案

### 3.1 方案概览

| 方案 | 类型 | 维护者 | 适用场景 |
|------|------|--------|----------|
| **YARP** | 反向代理库 | Microsoft | 自定义网关 |
| **Ocelot** | API 网关框架 | 开源社区 | 快速搭建 |
| **Azure API Management** | 云服务 | Microsoft | Azure 部署 |
| **Kong** | 独立网关 | Kong Inc | 多语言环境 |
| **自研（ASP.NET Core）** | 自定义 | - | 特殊需求 |

### 3.2 YARP（Yet Another Reverse Proxy）

**包**: `Yarp.ReverseProxy`

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();
app.MapReverseProxy();
app.Run();
```

**appsettings.json**:
```json
{
  "ReverseProxy": {
    "Routes": {
      "api-route": {
        "ClusterId": "api-cluster",
        "Match": { "Path": "/api/{**catch-all}" },
        "Transforms": [
          { "PathRemovePrefix": "/api" }
        ]
      }
    },
    "Clusters": {
      "api-cluster": {
        "LoadBalancingPolicy": "RoundRobin",
        "HealthCheck": {
          "Active": {
            "Enabled": true,
            "Interval": "00:00:10",
            "Path": "/health"
          }
        },
        "Destinations": {
          "d1": { "Address": "http://backend-1:5000" },
          "d2": { "Address": "http://backend-2:5000" }
        }
      }
    }
  }
}
```

**自定义中间件**:
```csharp
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(context =>
    {
        // 添加请求头
        context.AddRequestHeader("X-Forwarded-Host", context.HttpContext.Request.Host.Value);
        
        // 自定义转换
        context.AddRequestTransform(async transformContext =>
        {
            var userId = transformContext.HttpContext.User.FindFirst("sub")?.Value;
            if (userId != null)
            {
                transformContext.ProxyRequest.Headers.Add("X-User-Id", userId);
            }
        });
    });
```

### 3.3 Ocelot

**包**: `Ocelot`

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile("ocelot.json");
builder.Services.AddOcelot();

var app = builder.Build();
await app.UseOcelot();
app.Run();
```

**ocelot.json**:
```json
{
  "Routes": [
    {
      "DownstreamPathTemplate": "/api/users/{everything}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        { "Host": "users-service", "Port": 5001 }
      ],
      "UpstreamPathTemplate": "/users/{everything}",
      "UpstreamHttpMethod": [ "Get", "Post", "Put", "Delete" ],
      "AuthenticationOptions": {
        "AuthenticationProviderKey": "Bearer"
      },
      "RateLimitOptions": {
        "EnableRateLimiting": true,
        "Period": "1s",
        "Limit": 100
      }
    },
    {
      "DownstreamPathTemplate": "/api/orders/{everything}",
      "DownstreamScheme": "http",
      "DownstreamHostAndPorts": [
        { "Host": "orders-service", "Port": 5002 }
      ],
      "UpstreamPathTemplate": "/orders/{everything}",
      "LoadBalancerOptions": {
        "Type": "RoundRobin"
      }
    }
  ],
  "GlobalConfiguration": {
    "BaseUrl": "https://api.example.com"
  }
}
```

**服务发现（Consul）**:
```csharp
builder.Services.AddOcelot()
    .AddConsul();
```

```json
{
  "Routes": [
    {
      "DownstreamPathTemplate": "/api/{everything}",
      "DownstreamScheme": "http",
      "UpstreamPathTemplate": "/users/{everything}",
      "ServiceName": "users-service",
      "LoadBalancerOptions": { "Type": "RoundRobin" }
    }
  ],
  "GlobalConfiguration": {
    "ServiceDiscoveryProvider": {
      "Scheme": "http",
      "Host": "consul",
      "Port": 8500,
      "Type": "Consul"
    }
  }
}
```

### 3.4 自研网关（ASP.NET Core）

```csharp
// 简单反向代理实现
public class ProxyMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IHttpClientFactory _clientFactory;
    private readonly IServiceDiscovery _discovery;
    
    public ProxyMiddleware(RequestDelegate next, IHttpClientFactory clientFactory, 
        IServiceDiscovery discovery)
    {
        _next = next;
        _clientFactory = clientFactory;
        _discovery = discovery;
    }
    
    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value;
        
        // 路由匹配
        var service = ResolveService(path);
        if (service == null)
        {
            await _next(context);
            return;
        }
        
        // 服务发现
        var endpoint = await _discovery.GetEndpointAsync(service);
        
        // 转发请求
        var client = _clientFactory.CreateClient();
        var request = CreateProxyRequest(context, endpoint);
        var response = await client.SendAsync(request);
        
        // 复制响应
        await CopyResponseAsync(context, response);
    }
    
    private HttpRequestMessage CreateProxyRequest(HttpContext context, string endpoint)
    {
        var request = new HttpRequestMessage
        {
            Method = new HttpMethod(context.Request.Method),
            RequestUri = new Uri($"{endpoint}{context.Request.Path}{context.Request.QueryString}")
        };
        
        // 复制请求头
        foreach (var header in context.Request.Headers)
        {
            request.Headers.TryAddWithoutValidation(header.Key, header.Value.ToArray());
        }
        
        // 复制请求体
        if (context.Request.ContentLength > 0)
        {
            request.Content = new StreamContent(context.Request.Body);
        }
        
        return request;
    }
}
```

---

## 4. .NET 网关框架对比

### 4.1 功能对比

| 功能 | YARP | Ocelot | Azure APIM | Kong |
|------|:----:|:------:|:----------:|:----:|
| **路由** | ✅ | ✅ | ✅ | ✅ |
| **负载均衡** | ✅ | ✅ | ✅ | ✅ |
| **健康检查** | ✅ | ✅ | ✅ | ✅ |
| **限流** | 需扩展 | ✅ | ✅ | ✅ |
| **熔断** | 需扩展 | ✅ | ✅ | ✅ |
| **认证** | 需集成 | ✅ | ✅ | ✅ |
| **请求聚合** | ❌ | ✅ | ✅ | 插件 |
| **服务发现** | 需扩展 | ✅ | ✅ | ✅ |
| **缓存** | 需扩展 | ✅ | ✅ | ✅ |
| **WebSocket** | ✅ | ✅ | ✅ | ✅ |
| **gRPC** | ✅ | ❌ | ✅ | ✅ |
| **管理 UI** | ❌ | ❌ | ✅ | ✅ |

### 4.2 性能对比

| 指标 | YARP | Ocelot | Kong |
|------|:----:|:------:|:----:|
| **吞吐量** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **延迟** | < 1ms | 2-5ms | 1-2ms |
| **内存占用** | 低 | 中 | 高 |
| **CPU 占用** | 低 | 中 | 中 |

> YARP 是目前 .NET 生态中性能最好的方案，微软内部服务大量使用。

### 4.3 优劣势对比

#### YARP

| 优势 | 劣势 |
|------|------|
| ✅ 微软官方维护，长期支持 | ❌ 功能需要自己扩展 |
| ✅ 性能极佳 | ❌ 没有内置限流/熔断 |
| ✅ 高度可定制 | ❌ 学习曲线稍高 |
| ✅ 支持 gRPC/WebSocket | ❌ 无管理界面 |
| ✅ 与 ASP.NET Core 深度集成 | |

#### Ocelot

| 优势 | 劣势 |
|------|------|
| ✅ 开箱即用，功能完整 | ❌ 性能不如 YARP |
| ✅ 配置简单 | ❌ 不支持 gRPC |
| ✅ 内置限流/熔断/缓存 | ❌ 社区活跃度下降 |
| ✅ 支持服务发现（Consul/Eureka） | ❌ 扩展性有限 |
| ✅ 文档完善 | |

#### Azure API Management

| 优势 | 劣势 |
|------|------|
| ✅ 完整的管理界面 | ❌ 成本较高 |
| ✅ 开发者门户 | ❌ 仅限 Azure |
| ✅ 托管服务，无需运维 | ❌ 冷启动延迟 |
| ✅ 内置分析和监控 | ❌ 自定义受限 |
| ✅ 版本管理、API 文档 | |

#### Kong

| 优势 | 劣势 |
|------|------|
| ✅ 语言无关，多环境部署 | ❌ 不是 .NET 原生 |
| ✅ 丰富的插件生态 | ❌ 部署复杂（需要数据库） |
| ✅ 企业版功能强大 | ❌ 企业版收费 |
| ✅ 管理界面 | ❌ 与 .NET 集成不如原生方案 |

### 4.4 选型建议

| 场景 | 推荐方案 | 理由 |
|------|----------|------|
| **高性能需求** | YARP | 性能最佳，官方支持 |
| **快速搭建** | Ocelot | 功能完整，配置简单 |
| **Azure 部署** | Azure APIM | 托管服务，无需运维 |
| **多语言微服务** | Kong | 语言无关，插件丰富 |
| **深度定制** | YARP + 自定义扩展 | 可控性最强 |
| **中小型项目** | Ocelot | 够用且简单 |

---

## 5. 云部署网关设计注意事项

### 5.1 高可用设计

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    │   (Azure LB /   │
                    │    AWS ALB)     │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │   Gateway    │ │   Gateway    │ │   Gateway    │
    │  (Zone A)    │ │  (Zone B)    │ │  (Zone C)    │
    └──────────────┘ └──────────────┘ └──────────────┘
```

**关键点**：
- ✅ 多实例部署，跨可用区
- ✅ 无状态设计，支持水平扩展
- ✅ 健康检查配置
- ✅ 会话保持（如需要）

### 5.2 安全设计

```csharp
// 1. HTTPS 强制
app.UseHttpsRedirection();
app.UseHsts();

// 2. 请求头安全
app.Use(async (context, next) =>
{
    context.Response.Headers.Add("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Add("X-Frame-Options", "DENY");
    context.Response.Headers.Add("X-XSS-Protection", "1; mode=block");
    await next();
});

// 3. IP 白名单（内部服务）
builder.Services.AddReverseProxy()
    .AddTransforms(context =>
    {
        context.AddRequestTransform(async transformContext =>
        {
            var clientIp = transformContext.HttpContext.Connection.RemoteIpAddress;
            if (!IsAllowedIp(clientIp))
            {
                transformContext.HttpContext.Response.StatusCode = 403;
                return;
            }
        });
    });

// 4. 请求大小限制
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 10 * 1024 * 1024; // 10MB
});
```

### 5.3 限流与熔断

```csharp
// 使用 ASP.NET Core Rate Limiting (.NET 7+)
builder.Services.AddRateLimiter(options =>
{
    // 全局限流
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 100,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 10
            }));
    
    // 按路由限流
    options.AddPolicy("api", context =>
        RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: context.User.Identity?.Name ?? "anonymous",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = 1000,
                Window = TimeSpan.FromMinutes(1),
                SegmentsPerWindow = 6
            }));
    
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.StatusCode = 429;
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            error = "Too many requests",
            retryAfter = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter)
                ? retryAfter.TotalSeconds : 60
        }, token);
    };
});

app.UseRateLimiter();
```

### 5.4 可观测性

```csharp
// OpenTelemetry 集成
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing =>
    {
        tracing
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddSource("Yarp.ReverseProxy")
            .AddOtlpExporter(options =>
            {
                options.Endpoint = new Uri("http://otel-collector:4317");
            });
    })
    .WithMetrics(metrics =>
    {
        metrics
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddMeter("Yarp.ReverseProxy")
            .AddOtlpExporter();
    });

// 健康检查端点
builder.Services.AddHealthChecks()
    .AddCheck("gateway", () => HealthCheckResult.Healthy())
    .AddRedis(redisConnectionString)
    .AddUrlGroup(new Uri("http://backend/health"), "backend");

app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});
```

### 5.5 配置管理

```csharp
// 动态配置（无需重启）
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .ConfigureHttpClient((context, handler) =>
    {
        // 自定义 HttpClient
        handler.SslOptions.RemoteCertificateValidationCallback = 
            (sender, cert, chain, errors) => true; // 仅开发环境
    });

// 从配置中心加载（如 Azure App Configuration）
builder.Configuration.AddAzureAppConfiguration(options =>
{
    options.Connect(connectionString)
        .Select("Gateway:*")
        .ConfigureRefresh(refresh =>
        {
            refresh.Register("Gateway:Sentinel", refreshAll: true)
                .SetCacheExpiration(TimeSpan.FromSeconds(30));
        });
});
```

### 5.6 容器化部署

**Dockerfile**:
```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["Gateway/Gateway.csproj", "Gateway/"]
RUN dotnet restore "Gateway/Gateway.csproj"
COPY . .
WORKDIR "/src/Gateway"
RUN dotnet build -c Release -o /app/build

FROM build AS publish
RUN dotnet publish -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost/health || exit 1

ENTRYPOINT ["dotnet", "Gateway.dll"]
```

**Kubernetes 部署**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: gateway
        image: myregistry/api-gateway:latest
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 80
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 10
        env:
        - name: ASPNETCORE_ENVIRONMENT
          value: "Production"
---
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 80
  selector:
    app: api-gateway
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 5.7 云部署检查清单

```
┌─────────────────────────────────────────────────────────┐
│              云部署网关检查清单                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  高可用                                                 │
│  □ 多实例部署（至少 3 个）                              │
│  □ 跨可用区分布                                        │
│  □ 健康检查配置                                        │
│  □ 自动扩缩容策略                                      │
│                                                         │
│  安全                                                   │
│  □ HTTPS 强制                                          │
│  □ WAF 配置                                            │
│  □ DDoS 防护                                           │
│  □ 请求大小限制                                        │
│  □ 敏感信息脱敏                                        │
│                                                         │
│  性能                                                   │
│  □ 限流策略                                            │
│  □ 熔断降级                                            │
│  □ 响应缓存                                            │
│  □ 连接池配置                                          │
│                                                         │
│  可观测                                                 │
│  □ 日志聚合                                            │
│  □ 链路追踪                                            │
│  □ 指标监控                                            │
│  □ 告警配置                                            │
│                                                         │
│  运维                                                   │
│  □ 配置中心集成                                        │
│  □ 密钥管理（Key Vault）                               │
│  □ 蓝绿/金丝雀发布                                     │
│  □ 回滚策略                                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 6. 总结

### 核心要点

| 主题 | 关键点 |
|------|--------|
| **网关作用** | 统一入口、安全边界、流量管控、监控审计 |
| **推荐方案** | 高性能选 YARP，快速搭建选 Ocelot，Azure 选 APIM |
| **云部署** | 多实例、跨可用区、限流熔断、可观测性 |
| **安全** | HTTPS、WAF、限流、请求校验 |

### 选型速查

| 需求 | 方案 |
|------|------|
| 新项目 + 高性能 | YARP |
| 快速搭建 + 功能完整 | Ocelot |
| Azure 云原生 | Azure API Management |
| 多语言微服务 | Kong |

### 参考资源

- [YARP Documentation](https://microsoft.github.io/reverse-proxy/)
- [Ocelot Documentation](https://ocelot.readthedocs.io/)
- [Azure API Management](https://learn.microsoft.com/en-us/azure/api-management/)
- [Kong Gateway](https://docs.konghq.com/)
