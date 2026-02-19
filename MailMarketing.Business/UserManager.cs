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
    public string Register(User user, string passwordConfirm)
    {
        var validationResult = ValidateUserRegistration(user, passwordConfirm);
        if (validationResult != "OK") return validationResult;

        if (IsEmailRegistered(user.Email!))
            return "Bu mail adresi zaten kayıtlı!";

        // Şifreleme İşlemi (Madde 2.1 & 2.5)
        user.Password = PasswordHasher.Encrypt(user.Password!);
        user.IsActive = true;
        user.CreatedDate = DateTime.Now;

        _context.Users.Add(user);
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
    /// Madde 2.3: Şifre yenileme işlemi.
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