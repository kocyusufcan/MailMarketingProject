using MailMarketing.DataAccess;
using MailMarketing.Entity;
using System.Text.RegularExpressions;
using System.Linq;
using System;

namespace MailMarketing.Business;

public class UserManager
{
    private readonly MailMarketingContext _context;

    public UserManager(MailMarketingContext context)
    {
        _context = context;
    }

    // Parametresiz constructor'ı eski kodun patlamaması için geçici bıraktık.
    public UserManager() : this(new MailMarketingContext()) { }

    /// <summary>
    /// Madde 2.1: Yeni kullanıcı kaydı oluşturur.
    /// </summary>
    public string Register(User user, string passwordConfirm, string? invitationCode = null)
    {
        var validationResult = ValidateUserRegistration(user, passwordConfirm);
        if (validationResult != "OK") return validationResult;

        if (IsEmailRegistered(user.Email!))
            return "Bu mail adresi zaten kayıtlı!";

        // Rol ve Davet Kodu Mantığı
        if (user.IsAdmin)
        {
            // Admin için benzersiz bir davet kodu üret
            user.AdminInvitationCode = "MM-" + new Random().Next(100000, 999999).ToString();
            user.ParentAdminId = null;
        }
        else
        {
            // Kullanıcı için davet kodu doğrulaması yap
            if (string.IsNullOrEmpty(invitationCode))
                return "Kullanıcı kaydı için davet kodu zorunludur!";

            var admin = _context.Users.FirstOrDefault(u => u.IsAdmin && u.AdminInvitationCode == invitationCode.Trim().ToUpper());
            if (admin == null)
                return "Geçersiz veya hatalı davet kodu!";

            user.ParentAdminId = admin.Id;
            user.AdminInvitationCode = null;
        }

        // Şifreleme İşlemi (Madde 2.1 & 2.5)
        user.Password = PasswordHasher.Encrypt(user.Password!);
        user.CreatedDate = DateTime.Now;

        _context.Users.Add(user);
        _context.SaveChanges();

        // Yeni kullanıcı için "Tüm Aboneler" sistem klasörünü otomatik oluştur
        var allSubscribersGroup = new MailMarketing.Entity.SubscriberGroup
        {
            GroupName = "Tüm Aboneler",
            UserId = user.Id,
            CreatedAt = DateTime.Now,
            IsSystem = true
        };
        _context.SubscriberGroups.Add(allSubscribersGroup);
        _context.SaveChanges();

        return "OK";
    }

    /// <summary>
    /// Madde 2.2: Kullanıcı girişi doğrular.
    /// </summary>
    public User? Login(string email, string password)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            return null;

        var user = _context.Users.FirstOrDefault(u => 
            u.Email!.ToLower() == email.Trim().ToLower() && u.IsActive);

        if (user == null || string.IsNullOrEmpty(user.Password)) return null;

        return VerifyPassword(user, password) ? user : null;
    }

    /// <summary>
    /// Madde 2.3: Şifre yenileme işlemi (Şifremi Unuttum için).
    /// </summary>
    public string UpdatePassword(string email, string newPassword, string passwordConfirm)
    {
        if (!IsPasswordValid(newPassword))
            return "Parola en az 8 karakter olmalı; büyük-küçük harf ve rakam içermelidir!";

        if (newPassword != passwordConfirm) return "Parolalar eşleşmiyor!";
        
        var user = _context.Users.FirstOrDefault(u => u.Email!.ToLower() == email.Trim().ToLower());
        if (user == null) return "Kullanıcı bulunamadı!";

        user.Password = PasswordHasher.Encrypt(newPassword);
        _context.SaveChanges();
        return "OK";
    }

    /// <summary>
    /// Kullanıcının mevcut şifresini değiştirir.
    /// </summary>
    public string ChangePassword(int userId, string oldPassword, string newPassword, string confirmPassword)
    {
        var user = _context.Users.Find(userId);
        if (user == null) return "Kullanıcı bulunamadı!";

        // 1. Eski şifre kontrolü
        if (!VerifyPassword(user, oldPassword))
            return "Eski şifreniz yanlış!";

        // 2. Yeni şifre geçerlilik kontrolü
        if (!IsPasswordValid(newPassword))
            return "Yeni şifreniz en az 8 karakter olmalı; büyük-küçük harf ve rakam içermelidir!";

        // 3. Şifre tekrar kontrolü
        if (newPassword != confirmPassword)
            return "Yeni şifreler eşleşmiyor!";

        // 4. Mevcut şifre ile aynı mı kontrolü (Güvenlik için opsiyonel ama iyi bir pratik)
        if (oldPassword == newPassword)
            return "Yeni şifreniz eski şifreniz ile aynı olamaz!";

        // 5. Güncelle ve kaydet
        user.Password = PasswordHasher.Encrypt(newPassword);
        _context.SaveChanges();

        return "OK";
    }

    /// <summary>
    /// Kullanıcının e-posta adresini günceller.
    /// </summary>
    public string UpdateEmail(int userId, string newEmail)
    {
        if (string.IsNullOrWhiteSpace(newEmail)) return "E-posta adresi boş olamaz!";
        if (!IsValidEmailFormat(newEmail)) return "Geçersiz e-posta formatı!";
        if (IsEmailRegistered(newEmail)) return "Bu e-posta adresi zaten başka bir kullanıcı tarafından kullanılıyor!";

        var user = _context.Users.Find(userId);
        if (user == null) return "Kullanıcı bulunamadı!";

        user.Email = newEmail.Trim().ToLower();
        _context.SaveChanges();
        return "OK";
    }

    /// <summary>
    /// Kullanıcının isim ve soyisim bilgilerini günceller.
    /// </summary>
    public string UpdateProfileInfo(int userId, string firstName, string lastName)
    {
        if (string.IsNullOrWhiteSpace(firstName) || string.IsNullOrWhiteSpace(lastName))
            return "İsim ve soyisim boş olamaz!";

        var user = _context.Users.Find(userId);
        if (user == null) return "Kullanıcı bulunamadı!";

        user.FirstName = firstName.Trim();
        user.LastName = lastName.Trim();
        
        _context.SaveChanges();
        return "OK";
    }

    /// <summary>
    /// Kullanıcıyı ve ilgili verilerini kalıcı olarak siler.
    /// </summary>
    public bool DeleteAccount(int userId)
    {
        try
        {
            var user = _context.Users.Find(userId);
            if (user == null) return false;

            // 1. Kullanıcıya ait logları temizle
            var logs = _context.ActivityLogs.Where(l => l.UserId == userId);
            _context.ActivityLogs.RemoveRange(logs);

            // MailLog'da UserId yok, TemplateId veya SubscriberId üzerinden silmeliyiz
            var userTemplateIds = _context.Templates.Where(t => t.UserId == userId).Select(t => t.Id).ToList();
            var mailLogs = _context.MailLogs.Where(l => l.TemplateId != null && userTemplateIds.Contains(l.TemplateId.Value));
            _context.MailLogs.RemoveRange(mailLogs);

            // 2. Kullanıcıya ait bildirimleri temizle
            var notifications = _context.Notifications.Where(n => n.UserId == userId);
            _context.Notifications.RemoveRange(notifications);

            // 3. Kullanıcıya ait şablonları temizle
            var templates = _context.Templates.Where(t => t.UserId == userId);
            _context.Templates.RemoveRange(templates);

            // 4. Kullanıcıya ait abone gruplarını ve üyeliklerini temizle
            var groups = _context.SubscriberGroups.Where(g => g.UserId == userId).ToList();
            foreach (var group in groups)
            {
                var members = _context.SubscriberGroupMembers.Where(m => m.GroupId == group.Id);
                _context.SubscriberGroupMembers.RemoveRange(members);
            }
            _context.SubscriberGroups.RemoveRange(groups);

            // 5. Kullanıcıya ait aboneleri temizle
            var subscribers = _context.Subscribers.Where(s => s.UserId == userId);
            _context.Subscribers.RemoveRange(subscribers);

            // 6. Son olarak kullanıcıyı sil
            _context.Users.Remove(user);
            
            return _context.SaveChanges() > 0;
        }
        catch (Exception ex)
        {
            // Hata günlüğüne yazılabilir veya dışarıya fırlatılabilir
            System.Diagnostics.Debug.WriteLine($"Account Deletion Error: {ex.Message}");
            return false;
        }
    }

    public bool CheckUserByEmail(string email) => 
        _context.Users.Any(u => u.Email!.ToLower() == email.Trim().ToLower());

    #region Private Helpers (Clean Code Dokunuşları)

    private string ValidateUserRegistration(User user, string confirm)
    {
        if (string.IsNullOrEmpty(user.FirstName) || string.IsNullOrEmpty(user.LastName) || 
            string.IsNullOrEmpty(user.Email) || string.IsNullOrEmpty(user.Password))
            return "Lütfen tüm alanları doldurunuz!";

        if (!IsValidEmailFormat(user.Email))
            return "Geçersiz mail adresi formatı!";

        if (!IsPasswordValid(user.Password))
            return "Parola kriterleri karşılanmıyor! (8 karakter, Büyük/Küçük harf ve Rakam)";

        if (user.Password != confirm)
            return "Parolalar eşleşmiyor!";

        return "OK";
    }

    private bool IsValidEmailFormat(string email) => 
        Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$");

    private bool IsPasswordValid(string password) => 
        !string.IsNullOrEmpty(password) && 
        password.Length >= 8 && 
        password.Any(char.IsUpper) && 
        password.Any(char.IsLower) && 
        password.Any(char.IsDigit);

    private bool IsEmailRegistered(string email) => 
        _context.Users.Any(u => u.Email!.ToLower() == email.ToLower());

    private bool VerifyPassword(User user, string inputPassword)
    {
        try 
        {
            string decrypted = PasswordHasher.Decrypt(user.Password!);
            return decrypted == inputPassword.Trim();
        }
        catch 
        { 
            return user.Password == inputPassword; 
        }
    }

    #endregion
}