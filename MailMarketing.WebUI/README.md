# 🌐 Mail Marketing - Web Yönetim Paneli (ASP.NET Core MVC)

Bu proje, Mail Marketing ekosisteminin masaüstü/tarayıcı üzerinden yönetilmesini sağlayan zengin **ASP.NET Core MVC** Web Arayüzüdür. (Web UI)

Kampanya yöneticilerinin, şirket içi personelin ve admin yetkisine sahip kullanıcıların detaylı e-posta listelerini görüntülemesi, rapor ekranlarını geniş ekranda inceleyebilmesi ve HTML formatındaki sürükle-bırak şablon (kampanya) tasarımlarını çok daha profesyonel araçlarla yapabilmesi odaklanılarak geliştirilmiştir.

## 🛠️ Kullanılan Temel Teknolojiler & Bilişenler

- **Çatı (Framework):** ASP.NET Core 8.0 MVC (Model-View-Controller)
- **Arayüz & ŞablonMotoru:** Razor Pages, Native HTML5/CSS3
- **Bülten & Word Okuyucu:** `Mammoth` Kütüphanesi ile docx formatlı dosyaları HTML'e çevirme yeteneği.
- **Excel Aktarımı:** `EPPlus` kütüphanesi yardımıyla `.xlsx` uzantılı kullanıcı/müşteri verilerini web üzerinden içe (Import) ve dışa (Export) aktarım teknolojisi.
- **Mail Altyapısı (Gönderim):** `MailKit` kütüphanesi ile gelişmiş SMTP haberleşmesi, paralel Thread süreçleriyle yüzlerce e-postanın takılmadan iletilmesi.
- **Temel Mimari Bağlantısı:** API ve Native UI ile aynı veritabanını okuyan ortak paylaşımlı C# kütüphaneleri (`MailMarketing.Business` & `MailMarketing.Entity`).

---

### 📸 Ekran Görüntüleri & Videolar

| Anasayfa Dashboard | Raporlar Ekranı |
| :---: | :---: |
| <img src="../docs/web/Anasayfa.mp4" width="400" /> | <img src="../docs/web/Raporlar.mp4" width="400" /> |

| Abone Yönetimi | Sistem Tanımları | Şifre Yenileme |
| :---: | :---: | :---: |
| <img src="../docs/web/Aboneler.mp4" width="280" /> | <img src="../docs/web/TanimSayfasi.png" width="280" /> | <img src="../docs/web/SifremiUnuttum.png" width="280" /> |

---

## 🎁 Demo ve Test Kaynakları

Sistemi denemek için kök dizindeki `/demo` klasöründe yer alan örnek dosyaları kullanabilirsiniz:

1.  **Excel'den Abone Aktarımı:** `OrnekAboneler.xlsx` dosyasını "Aboneler -> Excel'den Aktar" kısmında kullanarak toplu yükleme yapabilirsiniz.
2.  **Word'den Şablon Oluşturma:** `Hos_Geldin_Sablonu_V2.docx` gibi dosyaları "Şablonlar -> Yeni Şablon -> Word'den Yükle" özelliğini test etmek için kullanabilirsiniz.

---

## 📋 Öne Çıkan Gelişmiş Özellikler

1. **Dashboard (Gelişmiş Kontrol Paneli):** Toplam gönderilen mail, güncel sunucu durumu (Bounced vs.), tıklanan kampanya oranlarını tek ekranda toplayan analitik yapı.
2. **Kapsamlı İçerik Editörü (WYSIWYG):** Markdown ya da hazır HTML kodları ile veya direkt Word belgesini yükleyerek anında zengin renkli (Premium) E-Posta şablonu çıkarma deneyimi.
3. **Session (Oturum) Güvenliği:** API tarafındaki JWT mantığının aksine, yetkilendirmeyi Cookie tabanlı Session algoritmalarıyla tarayıcı tarafında yürüten güvenli MVC mimarisi.
4. **Offline Destek (Fallow-up):** Asenkron sunucu işleyişi sayesinde siz sekmeyi kapatsanız bile 10.000 kişilik listenize e-postalar gitmeye devam eder.

## 🚀 Projeyi Derleme ve Çalıştırma

Web arayüzü doğrudan `MailMarketing.API` (Backend) katmanındaki veritabanı kurgusuna (`DataAccess`) bağlıdır. Öncelikle Database Migration işlemlerini yapmış olduğunuza emin olun.

1.  Uç birimi (Terminal) `MailMarketing.WebUI` dizininde açın.
2.  `appsettings.json` üzerindeki Veritabanı ConnectionString bilginizi kendi sunucunuza uygun şekilde güncelleyin.
3.  Terminale sırasıyla komutları girerek projeyi derleyip yayına alın:
    ```bash
    dotnet restore
    dotnet build
    dotnet run
    ```
4.  Çıkan lokal IP adresinden (Örn: `http://localhost:5xxx`) Yönetim Panelinize giriş sağlayın!

---
*İşletme boyutuna göre tam kapasiteli MVC altyapısı.*
