# ⚠️ DİKKAT: KURULUM ÖNCESİ YAPILMASI GEREKENLER

Bu projeyi bilgisayarınızda çalıştırmadan önce **mutlaka** aşağıdaki yapılandırma adımlarını tamamlamanız gerekmektedir. Aksi takdirde veritabanı bağlantısı kurulamaz veya mobil uygulama API'ye erişemez.

---

## 🛠️ Sistem Gereksinimleri

Projeyi sorunsuz çalıştırmak için bilgisayarınızda aşağıdaki araçların yüklü olması gerekir:

1. **.NET 8 SDK:** Backend ve Web projelerini derlemek için. ([İndir](https://dotnet.microsoft.com/download/dotnet/8.0))
2. **SQL Server:** Veritabanı için (SQL Express veya LocalDB önerilir).
3. **Node.js (LTS):** Mobil uygulama (Expo) paketlerini yönetmek için. ([İndir](https://nodejs.org/))
4. **Visual Studio 2022 / VS Code:** Kod düzenleme ve çalıştırma için.
5. **Expo Go (Mobil Uygulama):** Uygulamayı telefonunuzda test etmek için App Store veya Play Store'dan indirin.

---

## 1. Veritabanı ve Bağlantı Ayarları (Backend & Web)

Sistemin düzgün çalışabilmesi için hem **API** hem de **Web UI** projelerindeki veritabanı bağlantı cümlelerini (Connection String) ayarlamalısınız.

### Adım 1: `appsettings.json` Dosyalarını Düzenleyin
Aşağıdaki dosyaları açın ve bağlantı cümlelerini kendi SQL sunucunuza göre düzenleyin:
- `MailMarketing.API/appsettings.json`
- `MailMarketing.WebUI/appsettings.json`

```json
"ConnectionStrings": {
    "DefaultConnection": "Server=SİZİN_SQL_SUNUCU_ADINIZ;Database=MailMarketingDb;Trusted_Connection=True;MultipleActiveResultSets=true;Encrypt=False"
},
"Jwt": {
    "Key": "BURAYA_GİZLİ_VE_UZUN_BİR_ŞİFRE_YAZIN_ÖRN_SuperGizliKey12345!",
    "Issuer": "MailMarketingIssuer",
    "Audience": "MailMarketingAudience"
},
"SystemMail": {
    "Email": "lütfen kendi mail adresinizi giriniz",
    "Password": "lütfen kendi uygulama şifrenizi (App Password) giriniz",
    "Host": "smtp.gmail.com",
    "Port": 587,
    "EnableSSL": true
}
```

*Not: Eğer Gmail kullanıyorsanız, buradaki şifre normal mail şifreniz değil, Google Hesabınızdan alacağınız 16 haneli **Uygulama Şifresi (App Passwords)** olmalıdır.*

### Adım 2: Veritabanını Oluşturun (Migration)
API dizininde (`MailMarketing.API`) konsol/terminal açın ve şu komutu çalıştırarak veritabanı tablolarını otomatik oluşturun:

```bash
dotnet ef database update
```

---

## 2. Mobil Uygulama Ayarları (React Native / Expo)

Mobil uygulamanın (veya Web panelinizin) API ile haberleşebilmesi için arka planda çalışan API'nin IP adresini belirtmeniz gerekir.

### Adım 1: API URL'sini Ayarlayın
`MailMarketingMobile/constants/Config.ts` dosyasını açın:

```typescript
// Eğer fiziksel bir telefonda test ediyorsanız (Örn: Expo Go uygulamasında), 
// 'localhost' YERİNE bilgisayarınızın yerel Wi-Fi IP adresini yazmalısınız! (Örn: 192.168.1.50)

export const API_URL = 'http://192.168.1.X:5034/api'; 
```
*Not: Bilgisayarınızın IP adresini öğrenmek için terminale Windows'ta `ipconfig`, Mac'te `ifconfig` yazabilirsiniz.*

### Adım 2: Gerekli Paketleri Yükleyin
Mobil uygulama klasöründe terminal açın ve şu komutu çalıştırın:
```bash
npm install
```

---

## 3. Sosyal Medya ve İletişim Ayarları (Web)

Web arayüzündeki (özellikle İletişim sayfasındaki) sosyal medya linklerini ve iletişim bilgilerini kodun içerisine girmeden, merkezi bir yerden değiştirebilirsiniz.

### `appsettings.json` Dosyasını Düzenleyin
`MailMarketing.WebUI/appsettings.json` dosyasını açın ve aşağıdaki bölümleri kendinize göre güncelleyin:

```json
"SystemMail": {
  "Email": "iletisim@siteniz.com",
  "Password": "uygulama_sifresi_buraya",
  "Host": "smtp.gmail.com",
  "Port": 587,
  "EnableSSL": true
},
"SiteSettings": {
  "BaseUrl": "http://localhost:5205" 
},
"ContactInfo": {
  "Address": "Şirket Adresiniz veya Şehriniz",
  "Phone": "+90 5xx xxx xx xx",
  "Email": "iletisim@siteniz.com"
},
"SocialMedia": {
  "Facebook": "https://facebook.com/kullaniciadiniz",
  "Twitter": "https://twitter.com/kullaniciadiniz",
  "LinkedIn": "https://linkedin.com/in/kullaniciadiniz",
  "Instagram": "https://instagram.com/kullaniciadiniz"
}
```

*Not: `BaseUrl` kısmına uygulamanın yayında olacağı adresi yazmalısınız. Yerelde test ediyorsanız port numarasının (örn: 5205) doğru olduğundan emin olun.*

*Not: Şablon bu verileri otomatik olarak "İletişim" ve "Hakkımızda" gibi sayfalara yansıtacaktır.*

---

## 4. Sistemi Çalıştırma Sırası

Lütfen bileşenleri aşağıdaki sırayla başlatın:

1. **API:** `MailMarketing.API` dizininde terminal açıp `dotnet run` yazın.
2. **Web Paneli:** `MailMarketing.WebUI` dizininde terminal açıp `dotnet run` yazın.
3. **Mobil Uygulama:** `MailMarketingMobile` dizininde terminal açıp `npx expo start` yazın.

---

---

### 🎁 İlk Adımlar için Demo Kaynaklar

Kurulum bittikten sonra sistemi hemen test etmek isterseniz, projenin kök dizindeki **`/demo`** klasörüne sizin için örnek dosyalar bıraktım:
- **`OrnekAboneler.xlsx`**: Toplu abone yükleme testi için.
- **`Hos_Geldin_Sablonu_V2.docx`**: Word'den HTML'e şablon dönüştürme testi için.

Artık her şey hazır! İyi pazarlamalar! 🚀🏆

