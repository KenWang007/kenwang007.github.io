---
slug: dotnet-cache-compare
title: 🔄 .NET 缓存框架全面对比
---

# 🔄 .NET 缓存框架全面对比

## 1. .NET 缓存解决方案概览

### 1.1 缓存方案分类

| 分类 | 方案 | 适用场景 |
|------|------|----------|
| **本地缓存** | IMemoryCache、LazyCache | 单机应用、高频访问 |
| **分布式缓存** | IDistributedCache、Redis、Memcached | 集群部署、数据共享 |
| **混合缓存** | HybridCache、FusionCache | 多级缓存、高可用 |
| **HTTP 缓存** | ResponseCaching、OutputCache | API 响应缓存 |
| **数据访问缓存** | EF Core 二级缓存 | ORM 查询结果缓存 |

### 1.2 技术栈全景图

```
┌─────────────────────────────────────────────────────────────┐
│                    .NET 缓存技术栈                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  微软官方                          开源社区                  │
│  ────────                          ────────                  │
│  • IMemoryCache                    • FusionCache            │
│  • IDistributedCache               • LazyCache              │
│  • HybridCache (.NET 9)            • CacheManager           │
│  • ResponseCaching                 • EasyCaching            │
│  • OutputCache (.NET 7+)           • Cashew                 │
│                                    • Akavache               │
│                                                             │
│  分布式缓存后端                                              │
│  ────────────────                                           │
│  • Redis (StackExchange.Redis)                              │
│  • SQL Server                                               │
│  • NCache                                                   │
│  • Memcached                                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 微软官方缓存框架

### 2.1 IMemoryCache（本地缓存）

**包**: `Microsoft.Extensions.Caching.Memory`

```csharp
// 注册
builder.Services.AddMemoryCache();

// 使用
public class ProductService
{
    private readonly IMemoryCache _cache;
    
    public Product? GetProduct(int id)
    {
        return _cache.GetOrCreate($"product:{id}", entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1);
            entry.SlidingExpiration = TimeSpan.FromMinutes(10);
            entry.Priority = CacheItemPriority.High;
            
            return _repository.GetById(id);
        });
    }
}
```

| 特性 | 说明 |
|------|------|
| **存储位置** | 进程内存 |
| **过期策略** | 绝对过期、滑动过期 |
| **淘汰策略** | LRU + Priority |
| **大小限制** | 可配置 SizeLimit |
| **线程安全** | ✅ 是 |
| **序列化** | 不需要 |

**限制**：
- ❌ 不支持分布式
- ❌ 应用重启数据丢失
- ❌ 多实例数据不同步

### 2.2 IDistributedCache（分布式缓存抽象）

**包**: `Microsoft.Extensions.Caching.Distributed`

```csharp
// Redis 实现
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = "localhost:6379";
    options.InstanceName = "MyApp:";
});

// SQL Server 实现
builder.Services.AddDistributedSqlServerCache(options =>
{
    options.ConnectionString = connectionString;
    options.SchemaName = "dbo";
    options.TableName = "CacheTable";
});

// 使用
public class ProductService
{
    private readonly IDistributedCache _cache;
    
    public async Task<Product?> GetProductAsync(int id)
    {
        var key = $"product:{id}";
        var cached = await _cache.GetStringAsync(key);
        
        if (cached != null)
            return JsonSerializer.Deserialize<Product>(cached);
        
        var product = await _repository.GetByIdAsync(id);
        if (product != null)
        {
            await _cache.SetStringAsync(key, JsonSerializer.Serialize(product),
                new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1)
                });
        }
        
        return product;
    }
}
```

| 实现 | 包 | 说明 |
|------|-----|------|
| **Redis** | `Microsoft.Extensions.Caching.StackExchangeRedis` | 最常用，性能好 |
| **SQL Server** | `Microsoft.Extensions.Caching.SqlServer` | 利用现有数据库 |
| **Memory** | `Microsoft.Extensions.Caching.Memory` | 测试/开发用 |
| **NCache** | `NCache.Microsoft.Extensions.Caching` | 企业级方案 |

**限制**：
- ❌ API 过于简单，只支持 byte[] 
- ❌ 不支持防击穿
- ❌ 不支持多级缓存
- ❌ 需要手动序列化

### 2.3 HybridCache（.NET 9 新增）

**包**: `Microsoft.Extensions.Caching.Hybrid`

```csharp
// 注册
builder.Services.AddHybridCache(options =>
{
    options.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        Expiration = TimeSpan.FromHours(1),
        LocalCacheExpiration = TimeSpan.FromMinutes(5)
    };
});

// 配置 Redis 作为 L2 缓存
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = "localhost:6379";
});

// 使用
public class ProductService
{
    private readonly HybridCache _cache;
    
    public async Task<Product> GetProductAsync(int id)
    {
        return await _cache.GetOrCreateAsync(
            $"product:{id}",
            async cancel => await _repository.GetByIdAsync(id, cancel)
        );
    }
    
    // 带标签，支持批量失效
    public async Task<Product> GetProductWithTagsAsync(int id)
    {
        return await _cache.GetOrCreateAsync(
            $"product:{id}",
            async cancel => await _repository.GetByIdAsync(id, cancel),
            new HybridCacheEntryOptions { Expiration = TimeSpan.FromHours(1) },
            tags: ["products", $"category:{categoryId}"]
        );
    }
    
    // 按标签批量失效
    public async Task InvalidateCategoryAsync(int categoryId)
    {
        await _cache.RemoveByTagAsync($"category:{categoryId}");
    }
}
```

| 特性 | 说明 |
|------|------|
| **多级缓存** | 自动 L1(Memory) + L2(Redis) |
| **防击穿** | 内置 Stampede Protection |
| **序列化** | 自动处理 |
| **标签失效** | 支持按标签批量删除 |
| **类型安全** | 泛型 API |

**限制**：
- ❌ 仅 .NET 9+ 支持
- ❌ 相对较新，生态不如 FusionCache

### 2.4 OutputCache（.NET 7+）

**包**: `Microsoft.AspNetCore.OutputCaching`

```csharp
// 注册
builder.Services.AddOutputCache(options =>
{
    options.AddBasePolicy(builder => builder.Expire(TimeSpan.FromMinutes(10)));
    
    options.AddPolicy("Products", builder => builder
        .Expire(TimeSpan.FromHours(1))
        .Tag("products"));
});

// 使用 Redis 后端
builder.Services.AddStackExchangeRedisOutputCache(options =>
{
    options.Configuration = "localhost:6379";
});

app.UseOutputCache();

// 控制器中使用
[OutputCache(PolicyName = "Products")]
[HttpGet("{id}")]
public async Task<Product> GetProduct(int id)
{
    return await _service.GetProductAsync(id);
}

// 手动失效
public async Task UpdateProduct(Product product)
{
    await _repository.UpdateAsync(product);
    await _outputCache.EvictByTagAsync("products", default);
}
```

| 特性 | 说明 |
|------|------|
| **缓存层级** | HTTP 响应级别 |
| **存储** | 内存/Redis |
| **失效机制** | 标签、VaryBy |
| **自定义策略** | 灵活配置 |

---

## 3. 开源缓存框架

### 3.1 FusionCache（⭐ 推荐）

**包**: `ZiggyCreatures.FusionCache`

```csharp
// 注册
builder.Services.AddFusionCache()
    .WithDefaultEntryOptions(new FusionCacheEntryOptions
    {
        Duration = TimeSpan.FromHours(1),
        
        // 防击穿：故障安全
        IsFailSafeEnabled = true,
        FailSafeMaxDuration = TimeSpan.FromDays(1),
        FailSafeThrottleDuration = TimeSpan.FromSeconds(30),
        
        // 防击穿：工厂超时
        FactorySoftTimeout = TimeSpan.FromMilliseconds(100),
        FactoryHardTimeout = TimeSpan.FromSeconds(2),
        
        // 防雪崩：随机抖动
        JitterMaxDuration = TimeSpan.FromMinutes(2),
        
        // 后台刷新
        AllowBackgroundDistributedCacheOperations = true,
        AllowBackgroundBackplaneOperations = true
    })
    // L2: Redis
    .WithDistributedCache(new RedisCache(new RedisCacheOptions
    {
        Configuration = "localhost:6379"
    }))
    // 序列化
    .WithSerializer(new FusionCacheSystemTextJsonSerializer())
    // 背板（多实例同步）
    .WithBackplane(new RedisBackplane(new RedisBackplaneOptions
    {
        Configuration = "localhost:6379"
    }));

// 使用
public class ProductService
{
    private readonly IFusionCache _cache;
    
    public async Task<Product?> GetProductAsync(int id)
    {
        return await _cache.GetOrSetAsync(
            $"product:{id}",
            async ct => await _repository.GetByIdAsync(id, ct),
            new FusionCacheEntryOptions
            {
                Duration = TimeSpan.FromHours(1),
                FailSafeMaxDuration = TimeSpan.FromDays(1)
            }
        );
    }
    
    // Adaptive Caching：根据数据动态调整缓存策略
    public async Task<Product?> GetProductAdaptiveAsync(int id)
    {
        return await _cache.GetOrSetAsync(
            $"product:{id}",
            async (ctx, ct) =>
            {
                var product = await _repository.GetByIdAsync(id, ct);
                
                // 根据数据特征动态调整缓存时间
                if (product?.IsHotSale == true)
                    ctx.Options.Duration = TimeSpan.FromMinutes(5);  // 热销品短缓存
                else
                    ctx.Options.Duration = TimeSpan.FromHours(2);    // 普通品长缓存
                
                return product;
            }
        );
    }
}
```

| 特性 | 支持情况 |
|------|----------|
| **多级缓存** | ✅ L1 + L2 |
| **防击穿** | ✅ 内置锁 + 故障安全 |
| **防雪崩** | ✅ Jitter |
| **背板同步** | ✅ Redis/Memory |
| **Eager Refresh** | ✅ 提前刷新 |
| **Adaptive Caching** | ✅ 动态策略 |
| **OpenTelemetry** | ✅ 可观测性 |
| **最低版本** | .NET Standard 2.0 |

### 3.2 LazyCache

**包**: `LazyCache`

```csharp
// 注册
builder.Services.AddLazyCache();

// 使用
public class ProductService
{
    private readonly IAppCache _cache;
    
    public async Task<Product?> GetProductAsync(int id)
    {
        return await _cache.GetOrAddAsync(
            $"product:{id}",
            async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1);
                return await _repository.GetByIdAsync(id);
            }
        );
    }
}
```

| 特性 | 支持情况 |
|------|----------|
| **多级缓存** | ❌ 仅本地 |
| **防击穿** | ✅ 内置锁 |
| **API 简洁度** | ⭐⭐⭐⭐⭐ |
| **学习曲线** | 低 |
| **适用场景** | 简单本地缓存 |

### 3.3 EasyCaching

**包**: `EasyCaching.Core`

```csharp
// 注册多级缓存
builder.Services.AddEasyCaching(options =>
{
    // L1: 内存
    options.UseInMemory("m1");
    
    // L2: Redis
    options.UseRedis(config =>
    {
        config.DBConfig.Endpoints.Add(new ServerEndPoint("localhost", 6379));
    }, "r1");
    
    // 混合缓存
    options.UseHybrid(config =>
    {
        config.TopicName = "cache-sync";
        config.LocalCacheProviderName = "m1";
        config.DistributedCacheProviderName = "r1";
    });
    
    // Redis 总线（多实例同步）
    options.WithRedisBus(config =>
    {
        config.Endpoints.Add(new ServerEndPoint("localhost", 6379));
    });
});

// 使用
public class ProductService
{
    private readonly IHybridCachingProvider _cache;
    
    public async Task<Product?> GetProductAsync(int id)
    {
        var result = await _cache.GetAsync<Product>($"product:{id}");
        
        if (result.HasValue)
            return result.Value;
        
        var product = await _repository.GetByIdAsync(id);
        if (product != null)
        {
            await _cache.SetAsync($"product:{id}", product, TimeSpan.FromHours(1));
        }
        
        return product;
    }
}
```

| 特性 | 支持情况 |
|------|----------|
| **多级缓存** | ✅ Hybrid Provider |
| **多后端** | ✅ Memory/Redis/Memcached/SQLite |
| **AOP 拦截** | ✅ 注解式缓存 |
| **序列化** | ✅ 多种可选 |
| **响应缓存** | ✅ 支持 |

### 3.4 CacheManager

**包**: `CacheManager.Core`

```csharp
// 配置
var cache = CacheFactory.Build<Product>(settings =>
{
    settings
        .WithSystemRuntimeCacheHandle("memory")  // L1
        .And
        .WithRedisConfiguration("redis", config =>
        {
            config.WithEndpoint("localhost", 6379);
        })
        .WithRedisCacheHandle("redis");  // L2
});

// 使用
var product = cache.GetOrAdd("product:1", key => _repository.GetById(1));

// 更新
cache.Put("product:1", updatedProduct);

// 删除
cache.Remove("product:1");
```

| 特性 | 支持情况 |
|------|----------|
| **多级缓存** | ✅ 多 Handle 链 |
| **后端支持** | ✅ Memory/Redis/Memcached/Couchbase |
| **事件系统** | ✅ OnAdd/OnRemove/OnUpdate |
| **区域(Region)** | ✅ 支持 |
| **活跃度** | ⚠️ 维护模式 |

---

## 4. 多维度横向对比

### 4.1 功能对比

| 功能 | IMemoryCache | IDistributedCache | HybridCache | FusionCache | LazyCache | EasyCaching |
|------|:------------:|:-----------------:|:-----------:|:-----------:|:---------:|:-----------:|
| **本地缓存** | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **分布式缓存** | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **多级缓存** | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| **防击穿** | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| **防雪崩(Jitter)** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **故障安全** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **背板同步** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **标签失效** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **自动序列化** | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **OpenTelemetry** | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |

### 4.2 性能对比

| 框架 | 读取性能 | 写入性能 | 内存占用 | 说明 |
|------|:--------:|:--------:|:--------:|------|
| **IMemoryCache** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 低 | 最快，无额外开销 |
| **IDistributedCache** | ⭐⭐⭐ | ⭐⭐⭐ | 低 | 网络开销 |
| **HybridCache** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 中 | L1 命中快 |
| **FusionCache** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 中 | L1 命中快 |
| **LazyCache** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 低 | 封装 IMemoryCache |
| **EasyCaching** | ⭐⭐⭐⭐ | ⭐⭐⭐ | 中 | 功能多，略慢 |

### 4.3 易用性对比

| 框架 | API 简洁度 | 学习曲线 | 文档质量 | 社区活跃度 |
|------|:----------:|:--------:|:--------:|:----------:|
| **IMemoryCache** | ⭐⭐⭐ | 低 | ⭐⭐⭐⭐⭐ | 官方 |
| **IDistributedCache** | ⭐⭐ | 低 | ⭐⭐⭐⭐ | 官方 |
| **HybridCache** | ⭐⭐⭐⭐⭐ | 低 | ⭐⭐⭐⭐ | 官方(.NET 9) |
| **FusionCache** | ⭐⭐⭐⭐⭐ | 中 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **LazyCache** | ⭐⭐⭐⭐⭐ | 很低 | ⭐⭐⭐ | ⭐⭐⭐ |
| **EasyCaching** | ⭐⭐⭐ | 中 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

### 4.4 框架限制对比

| 框架 | 主要限制 |
|------|----------|
| **IMemoryCache** | 不支持分布式；无防击穿；应用重启丢失 |
| **IDistributedCache** | API 过于简单；需手动序列化；无防击穿 |
| **HybridCache** | 仅 .NET 9+；较新，生态待完善 |
| **FusionCache** | 配置项多，需要理解各参数含义 |
| **LazyCache** | 仅本地缓存；功能相对简单 |
| **EasyCaching** | 配置复杂；部分功能需要多个包 |
| **CacheManager** | 已进入维护模式，不推荐新项目使用 |

### 4.5 适用场景

| 场景 | 推荐方案 | 理由 |
|------|----------|------|
| **简单本地缓存** | IMemoryCache / LazyCache | 轻量、官方支持 |
| **纯分布式缓存** | IDistributedCache + Redis | 标准接口、易替换 |
| **生产级多级缓存** | FusionCache | 功能完善、久经验证 |
| **.NET 9+ 新项目** | HybridCache | 官方支持、标签失效 |
| **需要 AOP 缓存** | EasyCaching | 注解式缓存、拦截器 |
| **单体应用快速开发** | LazyCache | 极简 API |

---

## 5. 选型决策指南

### 5.1 决策树

```
你的需求是什么？
│
├── 仅需本地缓存？
│   ├── 需要极简 API？ → LazyCache
│   └── 标准官方方案？ → IMemoryCache
│
├── 需要分布式缓存？
│   ├── 仅分布式，无多级？ → IDistributedCache + Redis
│   └── 需要多级缓存？
│       ├── .NET 9+？ → HybridCache
│       └── .NET 8 及以下？ → FusionCache
│
├── 需要高可用/防击穿/故障安全？
│   └── FusionCache（最完善）
│
├── 需要多实例缓存同步？
│   ├── FusionCache + Backplane
│   └── EasyCaching + Redis Bus
│
└── 需要 AOP 注解式缓存？
    └── EasyCaching
```

### 5.2 版本兼容性

| 框架 | 最低 .NET 版本 | 推荐版本 |
|------|---------------|----------|
| **IMemoryCache** | .NET Standard 2.0 | 任意 |
| **IDistributedCache** | .NET Standard 2.0 | 任意 |
| **HybridCache** | .NET 9 | .NET 9+ |
| **FusionCache** | .NET Standard 2.0 | .NET 6+ |
| **LazyCache** | .NET Standard 2.0 | 任意 |
| **EasyCaching** | .NET Standard 2.0 | .NET 6+ |

### 5.3 NuGet 包清单

```xml
<!-- 微软官方 -->
<PackageReference Include="Microsoft.Extensions.Caching.Memory" Version="8.0.0" />
<PackageReference Include="Microsoft.Extensions.Caching.StackExchangeRedis" Version="8.0.0" />
<PackageReference Include="Microsoft.Extensions.Caching.Hybrid" Version="9.0.0" /> <!-- .NET 9 -->

<!-- FusionCache -->
<PackageReference Include="ZiggyCreatures.FusionCache" Version="1.2.0" />
<PackageReference Include="ZiggyCreatures.FusionCache.Serialization.SystemTextJson" Version="1.2.0" />
<PackageReference Include="ZiggyCreatures.FusionCache.Backplane.StackExchangeRedis" Version="1.2.0" />

<!-- LazyCache -->
<PackageReference Include="LazyCache" Version="2.4.0" />
<PackageReference Include="LazyCache.AspNetCore" Version="2.4.0" />

<!-- EasyCaching -->
<PackageReference Include="EasyCaching.Core" Version="1.9.2" />
<PackageReference Include="EasyCaching.InMemory" Version="1.9.2" />
<PackageReference Include="EasyCaching.Redis" Version="1.9.2" />
<PackageReference Include="EasyCaching.HybridCache" Version="1.9.2" />
```

---

## 6. 最佳实践示例

### 6.1 生产级配置（FusionCache）

```csharp
public static class CacheConfiguration
{
    public static IServiceCollection AddProductionCache(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var redisConnection = configuration.GetConnectionString("Redis");
        
        services.AddFusionCache()
            .WithDefaultEntryOptions(new FusionCacheEntryOptions
            {
                // 默认缓存时间
                Duration = TimeSpan.FromHours(1),
                
                // 故障安全：Redis 不可用时返回过期数据
                IsFailSafeEnabled = true,
                FailSafeMaxDuration = TimeSpan.FromDays(1),
                FailSafeThrottleDuration = TimeSpan.FromSeconds(30),
                
                // 防击穿：软超时后返回旧数据，后台继续加载
                FactorySoftTimeout = TimeSpan.FromMilliseconds(100),
                FactoryHardTimeout = TimeSpan.FromSeconds(2),
                
                // 防雪崩：随机抖动
                JitterMaxDuration = TimeSpan.FromMinutes(2),
                
                // 后台操作
                AllowBackgroundDistributedCacheOperations = true,
                AllowBackgroundBackplaneOperations = true
            })
            // L2 缓存
            .WithDistributedCache(
                new RedisCache(new RedisCacheOptions { Configuration = redisConnection }))
            // 序列化
            .WithSerializer(new FusionCacheSystemTextJsonSerializer())
            // 背板：多实例同步
            .WithBackplane(
                new RedisBackplane(new RedisBackplaneOptions { Configuration = redisConnection }))
            // OpenTelemetry
            .WithRegisteredLogger();
        
        return services;
    }
}
```

### 6.2 生产级配置（HybridCache .NET 9）

```csharp
public static class CacheConfiguration
{
    public static IServiceCollection AddProductionHybridCache(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // L2: Redis
        services.AddStackExchangeRedisCache(options =>
        {
            options.Configuration = configuration.GetConnectionString("Redis");
        });
        
        // HybridCache
        services.AddHybridCache(options =>
        {
            options.DefaultEntryOptions = new HybridCacheEntryOptions
            {
                Expiration = TimeSpan.FromHours(1),
                LocalCacheExpiration = TimeSpan.FromMinutes(5),
                Flags = HybridCacheEntryFlags.DisableUnderlyingData // 可选：禁用某些功能
            };
            
            options.MaximumKeyLength = 512;
            options.MaximumPayloadBytes = 1024 * 1024; // 1MB
        });
        
        return services;
    }
}
```

### 6.3 缓存服务封装

```csharp
public interface ICacheService
{
    Task<T?> GetOrSetAsync<T>(string key, Func<CancellationToken, Task<T?>> factory,
        TimeSpan? duration = null, CancellationToken ct = default);
    Task RemoveAsync(string key, CancellationToken ct = default);
    Task RemoveByPrefixAsync(string prefix, CancellationToken ct = default);
}

public class FusionCacheService : ICacheService
{
    private readonly IFusionCache _cache;
    private readonly ILogger<FusionCacheService> _logger;
    
    public FusionCacheService(IFusionCache cache, ILogger<FusionCacheService> logger)
    {
        _cache = cache;
        _logger = logger;
    }
    
    public async Task<T?> GetOrSetAsync<T>(string key, Func<CancellationToken, Task<T?>> factory,
        TimeSpan? duration = null, CancellationToken ct = default)
    {
        return await _cache.GetOrSetAsync(
            key,
            factory,
            duration.HasValue
                ? new FusionCacheEntryOptions { Duration = duration.Value }
                : null,
            ct
        );
    }
    
    public async Task RemoveAsync(string key, CancellationToken ct = default)
    {
        await _cache.RemoveAsync(key, token: ct);
        _logger.LogDebug("Cache removed: {Key}", key);
    }
    
    public async Task RemoveByPrefixAsync(string prefix, CancellationToken ct = default)
    {
        // FusionCache 不直接支持前缀删除
        // 需要结合 Redis SCAN 命令或使用标签
        _logger.LogWarning("RemoveByPrefix not implemented for FusionCache");
    }
}
```

---

## 7. 总结

### 推荐方案

| 场景 | 首选 | 备选 |
|------|------|------|
| **新项目 (.NET 9+)** | HybridCache | FusionCache |
| **现有项目 (.NET 6/7/8)** | FusionCache | EasyCaching |
| **简单本地缓存** | LazyCache | IMemoryCache |
| **仅分布式缓存** | IDistributedCache + Redis | - |
| **需要 AOP** | EasyCaching | - |
| **企业级/高可用** | FusionCache | NCache |

### 核心要点

1. **官方方案趋势**：HybridCache 是微软的未来方向，.NET 9+ 项目首选
2. **成熟稳定**：FusionCache 功能最完善，生产环境首选
3. **简单场景**：LazyCache 或 IMemoryCache 足够
4. **避免过度设计**：根据实际需求选择，不要为了"完善"而引入复杂性

### 参考资源

- [Microsoft Caching Documentation](https://learn.microsoft.com/en-us/aspnet/core/performance/caching)
- [HybridCache in .NET 9](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid)
- [FusionCache GitHub](https://github.com/ZiggyCreatures/FusionCache)
- [EasyCaching GitHub](https://github.com/dotnetcore/EasyCaching)
- [LazyCache GitHub](https://github.com/alastairtree/LazyCache)
