# ⚙️ Mail Marketing — Backend API (.NET 8)

<p>
  <img src="https://img.shields.io/badge/.NET_8-512BD4?style=for-the-badge&logo=dotnet&logoColor=white" />
  <img src="https://img.shields.io/badge/C%23-239120?style=for-the-badge&logo=c-sharp&logoColor=white" />
  <img src="https://img.shields.io/badge/Entity_Framework_Core-512BD4?style=for-the-badge&logo=dotnet&logoColor=white" />
  <img src="https://img.shields.io/badge/SQL_Server-CC2927?style=for-the-badge&logo=microsoft-sql-server&logoColor=white" />
  <img src="https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white" />
  <img src="https://img.shields.io/badge/Swagger-85EA2D?style=for-the-badge&logo=swagger&logoColor=black" />
</p>

Bu dizin, **Email Marketing Suite** platformunun tüm sunucu tarafı mantığını barındıran REST API katmanıdır. Kimlik doğrulama, abone yönetimi, asenkron mail gönderimi, bounce tespiti ve aktivite loglama gibi kritik iş süreçlerini güvenli ve ölçeklenebilir biçimde yönetir.

---

## 🏗️ N-Tier Mimari (Katmanlı Mimari)

Proje, sorumlulukların net biçimde ayrıştırıldığı 4 katmana bölünmüştür:

```
MailMarketing.API           → HTTP isteği/yanıtı (Controllers, Middleware, JWT)
    ↓
MailMarketing.Business      → İş kuralları (MailService, BounceCheck, LogManager)
    ↓
MailMarketing.DataAccess    → Veri erişimi (EF Core DbContext, Repository)
    ↓
MailMarketing.Entity        → POCO varlıkları (User, Subscriber, MailLog …)
```

### `MailMarketing.API` — Sunum Katmanı
HTTP isteklerini alır, JWT doğrulamasını yapar ve uygun iş servisine iletir. `Swagger/OpenAPI` dokümantasyonu bu katmanda çalışır.

### `MailMarketing.Business` — İş Mantığı Katmanı
- **`MailService`** — Paralel SMTP motoru, ISP engel stratejisi
- **`BounceCheckManager`** — IMAP dinleyicisi ile hatalı mail tespiti
- **`LogManager`** — Tüm platforma ait aktivite logları
- **`SubscriberManager`**, **`TemplateManager`**, **`UserManager`** — CRUD iş servisleri

### `MailMarketing.DataAccess` — Veri Erişim Katmanı
Entity Framework Core Code First yaklaşımıyla geliştirilmiştir. Migration'lar bu katmanda tutulur.

### `MailMarketing.Entity` — Varlık Modelleri
`User`, `Subscriber`, `SubscriberGroup`, `MailLog`, `Template`, `ActivityLog`, `SmtpSetting` gibi tüm POCO sınıflarını barındırır.

---

## 🔌 API Endpoint'leri

### 🔐 Auth (`/api/Auth`)
| Method | Endpoint | Açıklama |
|---|---|---|
| `POST` | `/login` | JWT token üretir, platform bazlı aktivite logu oluşturur |
| `POST` | `/register` | Admin veya davet koduyla alt kullanıcı kaydı |
| `POST` | `/logout` | Token üzerinden çıkış loglar (Web / Mobil) |
| `POST` | `/forgot-password` | E-posta doğrulama kodlu şifre sıfırlama |

### 👥 Subscribers (`/api/Subscribers`)
| Method | Endpoint | Açıklama |
|---|---|---|
| `GET` | `/all` | Kullanıcı bazlı tüm aboneler |
| `POST` | `/add/{groupId}` | Yeni abone ekle |
| `PUT` | `/update/{id}` | Abone bilgilerini güncelle |
| `DELETE` | `/delete/{id}` | Abone sil (gönderim geçmişi yoksa) |
| `POST` | `/bulk-delete` | Toplu abone silme |
| `POST` | `/bulk-status` | Toplu aktif/pasif geçiş |
| `POST` | `/import` | Excel'den (.xlsx) toplu abone aktarımı |
| `GET` | `/export` | Aboneleri Excel'e dışa aktar |
| `POST` | `/toggle-status/{id}` | Tekil abone durumu değiştir |

### 📂 Klasörler (Grup) (`/api/Subscribers`)
| Method | Endpoint | Açıklama |
|---|---|---|
| `GET` | `/folders` | Klasör listesi |
| `POST` | `/create-folder` | Yeni klasör oluştur |
| `DELETE` | `/delete-folder/{id}` | Klasörü sil |
| `POST` | `/add-to-group` | Aboneyi klasöre ekle |
| `DELETE` | `/remove-from-group/{id}` | Aboneyi klasörden çıkar |

### 🚀 Kampanyalar (`/api/Campaign`)
| Method | Endpoint | Açıklama |
|---|---|---|
| `POST` | `/send` | Kampanya gönderimini başlat |
| `GET` | `/templates` | Şablon listesi |
| `POST` | `/templates` | Yeni şablon oluştur |

### 📊 Raporlar (`/api/Reports`)
| Method | Endpoint | Açıklama |
|---|---|---|
| `GET` | `/history` | Gönderim geçmişi (filtreli) |
| `POST` | `/bulk-delete` | Rapor kayıtlarını sil |
| `GET` | `/export-csv` | Logları CSV olarak indir |
| `GET` | `/activity` | Aktivite günlüğü |
| `GET` | `/chart-data` | Haftalık grafik verisi |

---

## ⚙️ Öne Çıkan Mühendislik Çözümleri

### 1. Asenkron Paralel Mail Motoru
`MailService`, binlerce aboneye mail gönderirken `Task.WhenAll` ve özel gecikme (delay) stratejisini kullanarak UI'yı bloke etmeden çalışır. ISP kara listeye girmeyi önlemek için akıllı paketleme ve bekleme süresi algoritması uygulanmıştır.

```csharp
// Paralel gönderim - UI bloke etmeden
var tasks = recipients.Select(r => SendMailAsync(smtpClient, r));
await Task.WhenAll(tasks);
```

### 2. Bounce Kontrolü (IMAP Dinleyicisi)
`BounceCheckManager` servisi, IMAP protokolü üzerinden sistemin kendi gelen kutusunu dinler. Geri dönen mailler otomatik olarak ilgili `MailLog` kaydına hata mesajıyla işlenir. Bu sayede abonelerin spam/bounce skoru düşük tutulur.

### 3. JWT + Rol Tabanlı Yetkilendirme
Tüm endpoint'ler `[Authorize]` dekoratörüyle korunur. Admin ve Alt-Admin (sub-admin) için farklı yetki seviyeleri uygulanmıştır.

```csharp
[Authorize]
[HttpDelete("delete/{id}")]
public IActionResult DeleteSubscriber(int id) { ... }
```

### 4. Aktivite Loglama Sistemi
Platform dahilindeki her kritik eylem (oturum açma, abone ekleme/silme, kampanya gönderimi) `ActivityLog` tablosuna platform bilgisiyle (Web Sitesi / Mobil Uygulama) kayıt olunur.

### 5. Excel Import/Export (EPPlus v5)
Kullanıcıların kendi abone listelerini `.xlsx` formatında sisteme aktarabilmesine ve mevcut aboneleri Excel dosyası olarak indirmesine olanak tanır.

---

## 🛠️ Kullanılan Teknolojiler

| Teknoloji | Amaç |
|---|---|
| **.NET 8 Web API** | REST API çatısı |
| **C#** | Dil |
| **Entity Framework Core** | ORM, Code First migration |
| **SQL Server** | İlişkisel veritabanı |
| **JWT (System.IdentityModel)** | Token tabanlı kimlik doğrulama |
| **MailKit** | SMTP mail gönderimi ve IMAP dinleme |
| **EPPlus v5** | Excel okuma/yazma |
| **Swagger / OpenAPI** | API dokümantasyonu |
| **ASP.NET Core PasswordHasher** | Güvenli şifre hashleme |

---

## 🔌 Kurulum

> Aşağıdaki adımları takip ederek API'yi yerel ortamınızda çalıştırabilirsiniz.

**Gereksinimler:** .NET 8 SDK · Microsoft SQL Server

### 1. Veritabanı Bağlantısını Yapılandırın
`MailMarketing.DataAccess/MailMarketingContext.cs` dosyasını açın ve kendi SQL Server bilgilerinize göre güncelleyin:

```csharp
optionsBuilder.UseSqlServer(
    "Server=YOUR_SERVER\\SQLEXPRESS;Database=MailMarketingDB;" +
    "Trusted_Connection=True;TrustServerCertificate=True;"
);
```

### 2. Veritabanı Migration'larını Uygulayın
Proje EF Core Code First migration sistemi ile yapılandırılmıştır. Tek komutla tüm tabloları oluşturabilirsiniz:

```bash
cd MailMarketing.API
dotnet ef database update --project ../MailMarketing.DataAccess --startup-project .
```

### 3. API'yi Başlatın
API başladıktan sonra tarayıcınızdan tüm endpoint'leri test edebilirsiniz:
```
http://localhost:5034/swagger
```

---

*Bu katman SOLID prensiplerini, Clean Code pratiklerini ve IDisposable pattern standartlarını benimseyerek geliştirilmiştir.*

