using System;

namespace MailMarketing.Business;

public static class MailErrorHelper
{
    public static string GetFriendlyMessage(string technicalError)
    {
        if (string.IsNullOrEmpty(technicalError))
            return "Bilinmeyen bir hata oluştu.";

        string error = technicalError.ToLower();

        // 1. SMTP Kimlik / Yapılandırma Hataları
        if (error.Contains("authentication required") || error.Contains("not authenticated") || error.Contains("authentication failed") || error.Contains("username and password") || error.Contains("credentials"))
        {
            return "Kimlik Doğrulama Hatası: E-posta adresiniz veya şifreniz hatalı. Lütfen SMTP Ayarlarım ekranından bilgilerinizi kontrol edin. Gmail kullanıyorsanız şifre alanına Gmail Uygulama Şifresi (16 haneli) girmeniz gerekir.";
        }

        if (error.Contains("no such host") || error.Contains("server not found") || error.Contains("could not be resolved") || error.Contains("name or service not known") || error.Contains("hostname"))
        {
            return "Sunucu Hatası: Girdiğiniz SMTP sunucu adresi bulunamadı. Lütfen SMTP Ayarlarım ekranından sunucu adresini kontrol edin (Örn: smtp.gmail.com).";
        }

        if (error.Contains("timed out") || error.Contains("timeout") || error.Contains("connection reset") || error.Contains("refused") || error.Contains("connection was forcibly"))
        {
            return "Bağlantı Hatası: Sunucuya bağlanılamadı. Port numarasını (genellikle 587) ve SSL/TLS ayarını kontrol edin. İnternet bağlantınızda bir kısıtlama olabilir.";
        }

        if (error.Contains("secure connection") || error.Contains("starttls") || error.Contains("certificate"))
        {
            return "Güvenlik Hatası: Sunucu güvenli bağlantı gerektiriyor. Lütfen SMTP Ayarlarım ekranından SSL seçeneğini kontrol edin.";
        }

        // 2. Geçersiz Karakter / Format Hataları (Alıcı adresi veya mail başlığı)
        if (error.Contains("invalid character") || error.Contains("mail header") || error.Contains("illegal characters") || error.Contains("invalid address") || error.Contains("format is not recognized") || error.Contains("invalid mailaddress"))
        {
            return "Geçersiz Adres Formatı: Alıcının e-posta adresi hatalı karakterler içeriyor (örneğin noktalı virgül, boşluk veya özel karakter). Abone listenizdeki bu adresi düzeltin.";
        }

        // 3. Alıcı Kaynaklı Hatalar
        if (error.Contains("mailbox unavailable") || error.Contains("5.1.1") || error.Contains("user not found") || error.Contains("does not exist") || error.Contains("no mailbox"))
        {
            return "Alıcı Bulunamadı: Bu e-posta adresi artık kullanılmıyor veya hiç var olmamış. Abone listenizdeki bu adresi güncelleyin veya silin.";
        }

        if (error.Contains("quota") || error.Contains("storage full") || error.Contains("552") || error.Contains("over quota"))
        {
            return "Alıcının Posta Kutusu Dolu: Karşı tarafın depolama alanı dolduğu için e-posta iletilemedi.";
        }

        if (error.Contains("spam") || error.Contains("blacklist") || error.Contains("blocked") || error.Contains("rejected") || error.Contains("policy"))
        {
            return "Engellendi: E-postanız alıcı sunucu tarafından spam filtresi veya güvenlik politikası nedeniyle reddedildi.";
        }

        if (error.Contains("relay") || error.Contains("5.7.1"))
        {
            return "İletim Hatası: SMTP sunucunuz bu e-postayı iletmeye izin vermedi. SMTP ayarlarınızı ve hesap izinlerinizi kontrol edin.";
        }

        // 4. Genel Türkçe Hata
        return "Gönderim sırasında bir hata oluştu. Lütfen SMTP ayarlarınızı kontrol edin ve tekrar deneyin.";
    }
}
