# Mail Marketing Project

Bu proje, kullanıcılara toplu ve yönetilebilir e-posta gönderim imkanı sunan bir Mail Pazarlama uygulamasıdır. 

## ⚙️ Kurulum ve Çalıştırma

Projeyi kendi ortamınızda sorunsuz bir şekilde ayağa kaldırmak için lütfen aşağıdaki adımları sırasıyla uygulayın:

### 1. Veritabanı Kurulumu
Projenin ana dizininde bulunan `veritabani_yedek.sql` dosyasını SQL Server üzerinde çalıştırarak `MailMarketingDB` veritabanını ve tablolarını hazır hale getirin. (Dosya evrensel oluşturma komutlarını içerir, doğrudan çalıştırılabilir).

### 2. appsettings.json Yapılandırması (ÖNEMLİ!)
Projeyi derleyip çalıştırmadan önce Web/API katmanında bulunan `appsettings.json` dosyasındaki ilgili alanları kendi ortamınıza göre doldurmanız gerekmektedir.

Doldurulması gereken başlıca alanlar:
* **ConnectionStrings:** Kendi yerel SQL Server bağlantı cümleniz.
* **Mail/SMTP Ayarları:** E-posta gönderimi için kullanılacak e-posta adresi, şifre, SMTP sunucusu ve port bilgileri.

### 3. Çalıştırma
Gerekli yapılandırmaları tamamladıktan sonra projeyi Visual Studio üzerinden başlatabilir veya terminalde uygulamanın bulunduğu dizine giderek `dotnet run` komutunu çalıştırabilirsiniz.