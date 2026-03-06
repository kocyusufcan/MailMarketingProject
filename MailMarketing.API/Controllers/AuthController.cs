using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using MailMarketing.Business; // UserManager buradan geliyor
using MailMarketing.DataAccess;
using MailMarketing.Entity;

namespace MailMarketing.API.Controllers;

[Route("api/[controller]")]
[ApiController]
public class AuthController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly UserManager _userManager = new UserManager(); 
    
    // Geçici verileri tutmak için Dictionary yapılarımız
    private static readonly Dictionary<string, string> _resetCodes = new();
    private static readonly Dictionary<string, PendingRegistration> _pendingRegistrations = new();
    private static readonly Dictionary<int, PendingEmailChange> _pendingEmailChanges = new();
    private readonly MailService _mailService = new MailService();

    public AuthController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    [HttpPost("login")]
    public IActionResult Login([FromBody] LoginModel model)
    {
        // Önce kullanıcının varlığını ve aktiflik durumunu kontrol edelim
        using (var db = new MailMarketingContext())
        {
            var user = db.Users.FirstOrDefault(u => u.Email!.ToLower() == model.Email.Trim().ToLower());
            if (user == null)
                return Unauthorized(new { message = "E-posta veya şifre hatalı!" });

            // Şifre kontrolü
            bool isPasswordCorrect = false;
            try { 
                isPasswordCorrect = PasswordHasher.Decrypt(user.Password!) == model.Password.Trim(); 
            } catch { 
                isPasswordCorrect = user.Password == model.Password; 
            }

            if (!isPasswordCorrect)
                return Unauthorized(new { message = "E-posta veya şifre hatalı!" });

            // Giriş Başarılı - JWT Üret (Sadece aktif hesaplar DB'de olacağı için IsActive kontrolüne gerek kalmadı)
            var token = GenerateJwtToken(user);

            // Aktivite kaydı: Giriş Yapıldı
            string platformInfo = string.IsNullOrWhiteSpace(model.Platform) ? "Bilinmeyen Cihaz" : model.Platform;
            LogManager.LogAction(user.Id, "Oturum Açıldı", $"Sisteme giriş yapıldı ({platformInfo}).");
            return Ok(new
            {
                token,
                user = new
                {
                    user.Id,
                    user.FirstName,
                    user.LastName,
                    user.Email,
                    user.IsAdmin,
                    user.DisplayName
                }
            });
        }
    }

    [HttpPost("logout")]
    [Authorize]
    public IActionResult Logout([FromBody] LogoutModel model)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrEmpty(sid) && int.TryParse(sid, out int userId))
        {
            string platformInfo = string.IsNullOrWhiteSpace(model?.Platform) ? "Bilinmeyen Cihaz" : model.Platform;
            LogManager.LogAction(userId, "Oturum Kapatıldı", $"Sistemden güvenli çıkış yapıldı ({platformInfo}).");
        }
        return Ok(new { message = "Çıkış işlemi loglandı." });
    }

    private string GenerateJwtToken(User user)
    {
        var jwtSettings = _configuration.GetSection("Jwt");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings["Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email ?? ""),
            new Claim("FirstName", user.FirstName ?? ""),
            new Claim("LastName", user.LastName ?? ""),
            new Claim(ClaimTypes.Role, user.IsAdmin ? "Admin" : "User")
        };

        var token = new JwtSecurityToken(
            issuer: jwtSettings["Issuer"],
            audience: jwtSettings["Audience"],
            claims: claims,
            expires: DateTime.Now.AddMinutes(Convert.ToDouble(jwtSettings["ExpireMinutes"])),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    [HttpPost("register")]
    public IActionResult Register([FromBody] RegisterModel model)
    {
        if (model.Password != model.ConfirmPassword)
            return BadRequest(new { message = "Parolalar eşleşmiyor!" });

        // Rol ve Davet Kodu Mantığı Kontrolü
        if (model.IsAdmin && !string.IsNullOrEmpty(model.InvitationCode))
            return BadRequest(new { message = "Yeni bir yönetici hesabı oluştururken davet kodu kullanılamaz. Eğer bir ekibe katılmak istiyorsanız lütfen 'Kullanıcı' seçeneğini seçin." });

        if (!model.IsAdmin && string.IsNullOrEmpty(model.InvitationCode))
            return BadRequest(new { message = "Kullanıcı kaydı için davet kodu zorunludur!" });

        // Önce veritabanında gerçekten aktif bir üye olup olmadığına bak
        using (var db = new MailMarketingContext())
        {
            var existingUser = db.Users.FirstOrDefault(u => u.Email!.ToLower() == model.Email.Trim().ToLower());
            if (existingUser != null)
                return BadRequest(new { message = "Bu e-posta adresi zaten kayıtlı ve aktif. Lütfen giriş yapınız." });

            if (!model.IsAdmin && !string.IsNullOrEmpty(model.InvitationCode))
            {
                var admin = db.Users.FirstOrDefault(u => u.IsAdmin && u.AdminInvitationCode == model.InvitationCode.Trim().ToUpper());
                if (admin == null)
                    return BadRequest(new { message = "Geçersiz veya hatalı davet kodu!" });
            }
        }

        // Bilgileri ve kodu hafızaya al (Veritabanına henüz yazmıyoruz)
        string activationCode = new Random().Next(100000, 999999).ToString();
        _pendingRegistrations[model.Email.ToLower()] = new PendingRegistration
        {
            Model = model,
            Code = activationCode,
            ExpirationTime = DateTime.Now.AddMinutes(5)
        };

        _mailService.SendActivationCode(model.Email, activationCode);

        return Ok(new { message = "Aktivasyon kodu gönderildi! Lütfen e-postanızı kontrol ediniz." });
    }

    [HttpPost("verify-activation")]
    public IActionResult VerifyActivation([FromBody] VerifyActivationModel model)
    {
        if (string.IsNullOrEmpty(model.Email) || string.IsNullOrEmpty(model.Code))
            return BadRequest(new { message = "E-posta ve kod gereklidir." });

        string emailKey = model.Email.ToLower();

        if (_pendingRegistrations.TryGetValue(emailKey, out var pending))
        {
            if (pending.Code == model.Code)
            {
                // Kod doğru! Şimdi veritabanına kaydı yapalım
                var user = new User
                {
                    FirstName = pending.Model.FirstName,
                    LastName = pending.Model.LastName,
                    Email = pending.Model.Email,
                    Password = pending.Model.Password,
                    IsAdmin = pending.Model.IsAdmin,
                    IsActive = true, // Artık aktive edildi
                    CreatedDate = DateTime.Now
                };

                string result = _userManager.Register(user, pending.Model.ConfirmPassword, pending.Model.InvitationCode);

                if (result == "OK")
                {
                    _pendingRegistrations.Remove(emailKey);
                    return Ok(new { message = "Kaydınız başarıyla tamamlandı! Şimdi giriş yapabilirsiniz." });
                }

                return BadRequest(new { message = result });
            }
        }

        return BadRequest(new { message = "Geçersiz veya süresi dolmuş aktivasyon kodu!" });
    }

    [HttpPost("resend-activation")]
    public IActionResult ResendActivation([FromBody] ResendActivationModel model)
    {
        if (string.IsNullOrEmpty(model.Email))
            return BadRequest(new { message = "E-posta gereklidir." });

        string emailKey = model.Email.ToLower();

        if (_pendingRegistrations.TryGetValue(emailKey, out var pending))
        {
            string newCode = new Random().Next(100000, 999999).ToString();
            pending.Code = newCode;
            _mailService.SendActivationCode(model.Email, newCode);

            return Ok(new { message = "Yeni aktivasyon kodu gönderildi." });
        }

        return BadRequest(new { message = "Bekleyen bir kayıt başvurusu bulunamadı. Lütfen tekrar kayıt olun." });
    }

    [HttpPost("forgot-password")]
    public IActionResult ForgotPassword([FromBody] ForgotPasswordModel model)
    {
        if (string.IsNullOrEmpty(model.Email))
            return BadRequest(new { message = "E-posta adresi boş olamaz." });

        bool exists = _userManager.CheckUserByEmail(model.Email);
        if (!exists)
            return NotFound(new { message = "Bu e-posta adresi ile kayıtlı bir kullanıcı bulunamadı." });

        string resetCode = new Random().Next(100000, 999999).ToString();
        
        // Kodu hafızaya kaydet
        _resetCodes[model.Email.ToLower()] = resetCode;

        _mailService.SendForgotPasswordCode(model.Email, resetCode);

        return Ok(new { message = "Şifre sıfırlama kodu e-posta adresinize gönderildi." });
    }

    [HttpPost("verify-code")]
    public IActionResult VerifyCode([FromBody] VerifyCodeModel model)
    {
        if (string.IsNullOrEmpty(model.Email) || string.IsNullOrEmpty(model.Code))
            return BadRequest(new { message = "Lütfen tüm alanları doldurun." });

        string key = model.Email.ToLower();
        if (_resetCodes.ContainsKey(key) && _resetCodes[key] == model.Code)
        {
            return Ok(new { message = "Kod doğrulandı. Yeni şifrenizi belirleyebilirsiniz." });
        }

        return BadRequest(new { message = "Geçersiz veya hatalı sıfırlama kodu!" });
    }

    [HttpPost("reset-password")]
    public IActionResult ResetPassword([FromBody] ResetPasswordModel model)
    {
        if (string.IsNullOrEmpty(model.Email) || string.IsNullOrEmpty(model.Code) || string.IsNullOrEmpty(model.NewPassword))
            return BadRequest(new { message = "Lütfen tüm alanları doldurun." });

        string key = model.Email.ToLower();
        if (!_resetCodes.ContainsKey(key) || _resetCodes[key] != model.Code)
            return BadRequest(new { message = "Geçersiz veya hatalı sıfırlama kodu!" });

        // Mevcut şifre kontrolü (Security Check)
        using (var db = new MailMarketingContext())
        {
            var user = db.Users.FirstOrDefault(u => u.Email!.ToLower() == model.Email.Trim().ToLower());
            if (user != null)
            {
                string encryptedNew = PasswordHasher.Encrypt(model.NewPassword);
                if (user.Password == encryptedNew)
                {
                    return BadRequest(new { message = "Girmeye çalıştığınız şifre ile mevcut şifreniz aynı!" });
                }
            }
        }

        // Şifreyi güncelle (UserManager üzerinden)
        string result = _userManager.UpdatePassword(model.Email, model.NewPassword, model.ConfirmPassword);
        
        if (result == "OK")
        {
            _resetCodes.Remove(key); // Başarılıysa kodu sil
            return Ok(new { message = "Şifreniz başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz." });
        }

        return BadRequest(new { message = result });
    }

    [HttpDelete("account")]
    [Authorize]
    public IActionResult DeleteAccount()
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
        if (userId == 0) return Unauthorized();

        bool success = _userManager.DeleteAccount(userId);
        if (success)
            return Ok(new { message = "Hesabınız başarıyla silindi." });

        return BadRequest(new { message = "Hesap silme işlemi sırasında bir hata oluştu." });
    }

    [HttpGet("profile")]
    [Authorize]
    public IActionResult GetProfile()
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
        using (var db = new MailMarketingContext())
        {
            var user = db.Users.Find(userId);
            if (user == null) return NotFound();
            return Ok(new { 
                user.FirstName, 
                user.LastName, 
                user.Email, 
                user.IsAdmin,
                user.DisplayName,
                user.IsPublic,
                user.AdminInvitationCode
            });
        }
    }

    [HttpPut("branding")]
    [Authorize]
    public IActionResult UpdateBranding([FromBody] BrandingModel model)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");
        using (var db = new MailMarketingContext())
        {
            var user = db.Users.Find(userId);
            if (user == null) return NotFound();

            user.DisplayName = model.DisplayName;
            user.IsPublic = model.IsPublic;

            db.SaveChanges();
            return Ok(new { message = "Markalama ayarları güncellendi.", user.DisplayName, user.IsPublic });
        }
    }

    [HttpPut("profile-info")]
    [Authorize]
    public IActionResult UpdateProfileInfo([FromBody] UpdateProfileInfoModel model)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int userId = int.Parse(sid);

        string result = _userManager.UpdateProfileInfo(userId, model.FirstName, model.LastName);

        if (result == "OK")
        {
            return Ok(new { message = "Profil bilgileriniz başarıyla güncellendi." });
        }

        return BadRequest(new { message = result });
    }

    [HttpPost("change-password")]
    [Authorize]
    public IActionResult ChangePassword([FromBody] ChangePasswordModel model)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int userId = int.Parse(sid);

        string result = _userManager.ChangePassword(userId, model.OldPassword, model.NewPassword, model.ConfirmPassword);

        if (result == "OK")
        {
            return Ok(new { message = "Şifreniz başarıyla değiştirildi." });
        }

        return BadRequest(new { message = result });
    }

    [HttpPost("request-email-change")]
    [Authorize]
    public IActionResult RequestEmailChange([FromBody] RequestEmailChangeModel model)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int userId = int.Parse(sid);

        if (string.IsNullOrWhiteSpace(model.NewEmail))
            return BadRequest(new { message = "Yeni e-posta adresi gereklidir." });

        if (_userManager.CheckUserByEmail(model.NewEmail))
            return BadRequest(new { message = "Bu e-posta adresi zaten başka bir kullanıcı tarafından kullanılıyor." });

        string code = new Random().Next(100000, 999999).ToString();
        _pendingEmailChanges[userId] = new PendingEmailChange
        {
            NewEmail = model.NewEmail.Trim().ToLower(),
            Code = code,
            Expiration = DateTime.Now.AddSeconds(60)
        };

        _mailService.SendActivationCode(model.NewEmail, code); // Aktivasyon kodu şablonunu kullanabiliriz

        return Ok(new { message = "Doğrulama kodu yeni e-posta adresinize gönderildi." });
    }

    [HttpPost("verify-email-change")]
    [Authorize]
    public IActionResult VerifyEmailChange([FromBody] VerifyEmailChangeModel model)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int userId = int.Parse(sid);

        if (!_pendingEmailChanges.TryGetValue(userId, out var pending))
            return BadRequest(new { message = "Aktif bir e-posta değiştirme talebi bulunamadı." });

        if (pending.Expiration < DateTime.Now)
            return BadRequest(new { message = "Doğrulama kodunun süresi dolmuş." });

        if (pending.Code != model.Code)
            return BadRequest(new { message = "Hatalı doğrulama kodu." });

        string result = _userManager.UpdateEmail(userId, pending.NewEmail);
        if (result == "OK")
        {
            _pendingEmailChanges.Remove(userId);
            return Ok(new { message = "E-posta adresiniz başarıyla güncellendi." });
        }

        return BadRequest(new { message = result });
    }

    [HttpGet("users")]
    [Authorize] // Admin kontrolünü aşağıda manuel yapacağız veya her admin görebilir ama filtrelenmiş şekilde
    public IActionResult GetUsers()
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int currentUserId = int.Parse(sid);

        using (var db = new MailMarketingContext())
        {
            var currentUser = db.Users.Find(currentUserId);
            if (currentUser == null) return NotFound();

            if (!currentUser.IsAdmin) return Forbid(); // Sadece adminler listeyi görebilir

            IQueryable<User> usersQuery;

            if (currentUser.ParentAdminId == null)
            {
                // Root Admin: Kendi ekibini (ParentAdminId == currentUserId) tam yetkiyle görür.
                // Kendi eklediği biri Admin olsa bile onu görmeye devam etmelidir.
                usersQuery = db.Users.Where(u => u.ParentAdminId == currentUserId || u.Id == currentUserId);
            }
            else
            {
                // Sub-Admin: Sadece kendini ve aynı Root'a bağlı admin olmayan kullanıcıları görür.
                usersQuery = db.Users.Where(u => u.Id == currentUserId || 
                                                (u.ParentAdminId == currentUser.ParentAdminId && !u.IsAdmin));
            }

            var result = usersQuery
                          .Select(u => new { u.Id, u.FirstName, u.LastName, u.Email, u.IsActive, u.IsAdmin, u.CreatedDate })
                          .OrderByDescending(u => u.CreatedDate)
                          .ToList();

            return Ok(result);
        }
    }

    [HttpPost("toggle-admin/{id}")]
    [Authorize]
    public IActionResult ToggleAdmin(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int currentUserId = int.Parse(sid);

        if (currentUserId == id) return BadRequest(new { message = "Kendi yetkinizi değiştiremezsiniz." });

        using (var db = new MailMarketingContext())
        {
            var adminUser = db.Users.Find(currentUserId);
            var targetUser = db.Users.Find(id);

            if (adminUser == null || targetUser == null) return NotFound();
            if (!adminUser.IsAdmin) return Forbid();

            int myRoot = adminUser.ParentAdminId ?? adminUser.Id;
            int targetRoot = targetUser.ParentAdminId ?? targetUser.Id;

            if (myRoot == targetRoot)
            {
                // Root owner (firm sahibi) ise herkesi değiştirebilir. 
                // Sub-admin ise Root'u değiştiremez.
                if (targetUser.Id == myRoot && adminUser.Id != myRoot) return Forbid();

                targetUser.IsAdmin = !targetUser.IsAdmin;

                if (targetUser.IsAdmin)
                {
                    var rootUser = db.Users.Find(myRoot);
                    targetUser.AdminInvitationCode = rootUser?.AdminInvitationCode;
                }
                else
                {
                    targetUser.AdminInvitationCode = null;
                }

                db.SaveChanges();

                string yetkiDurumu = targetUser.IsAdmin ? "Admin yetkisi verildi" : "Admin yetkisi geri alındı";
                LogManager.LogAction(currentUserId, "Yetki Değişikliği", $"'{targetUser.Email}' kullanıcısına {yetkiDurumu}.");

                return Ok(new { message = $"Kullanıcı yetkisi { (targetUser.IsAdmin ? "Admin" : "Kullanıcı") } olarak güncellendi." });
            }
        }
        return Forbid();
    }

    [HttpPost("toggle-status/{id}")]
    [Authorize]
    public IActionResult ToggleStatus(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int currentUserId = int.Parse(sid);

        if (currentUserId == id) return BadRequest(new { message = "Kendi durumunuzu değiştiremezsiniz." });

        using (var db = new MailMarketingContext())
        {
            var currentUser = db.Users.Find(currentUserId);
            var targetUser = db.Users.Find(id);

            if (currentUser == null || targetUser == null) return NotFound();
            if (!currentUser.IsAdmin) return Forbid();

            int myRoot = currentUser.ParentAdminId ?? currentUser.Id;
            int targetRoot = targetUser.ParentAdminId ?? targetUser.Id;

            if (myRoot == targetRoot)
            {
                if (targetUser.Id == myRoot && currentUser.Id != myRoot) return Forbid();

                targetUser.IsActive = !targetUser.IsActive;
                db.SaveChanges();

                string durum = targetUser.IsActive ? "Aktif" : "Pasif";
                LogManager.LogAction(currentUserId, "Kullanıcı Durumu Değişti", $"'{targetUser.Email}' kullanıcısı {durum} alındı.");

                return Ok(new { message = $"Kullanıcı durumu {durum} olarak güncellendi." });
            }
        }
        return Forbid();
    }

    [HttpDelete("delete-user/{id}")]
    [Authorize]
    public IActionResult DeleteUser(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int currentUserId = int.Parse(sid);

        if (currentUserId == id) return BadRequest(new { message = "Kendi hesabınızı bu ekrandan silemezsiniz." });

        using (var db = new MailMarketingContext())
        {
            var currentUser = db.Users.Find(currentUserId);
            var targetUser = db.Users.Find(id);

            if (currentUser == null || targetUser == null) return NotFound();
            if (!currentUser.IsAdmin) return Forbid();

            int myRoot = currentUser.ParentAdminId ?? currentUser.Id;
            int targetRoot = targetUser.ParentAdminId ?? targetUser.Id;

            if (myRoot == targetRoot)
            {
                if (targetUser.Id == myRoot && currentUser.Id != myRoot) return Forbid();

                string targetEmail = targetUser.Email ?? "Bilinmeyen";
                
                // UserManager üzerinden tam silme işlemi yapalım (verileri temizler)
                _userManager.DeleteAccount(id);

                LogManager.LogAction(currentUserId, "Kullanıcı Silindi", $"'{targetEmail}' kullanıcısı admin tarafından silindi.");

                return Ok(new { message = "Kullanıcı ve bağlı tüm veriler başarıyla silindi." });
            }
        }
        return Forbid();
    }

    [HttpGet("user-activity/{id}")]
    [Authorize]
    public IActionResult GetUserActivity(int id, int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int currentUserId = int.Parse(sid);
        int pageSize = 15;

        using (var db = new MailMarketingContext())
        {
            var currentUser = db.Users.Find(currentUserId);
            var targetUser = db.Users.Find(id);

            if (currentUser == null || targetUser == null) return NotFound();
            if (!currentUser.IsAdmin) return Forbid();

            int myRoot = currentUser.ParentAdminId ?? currentUser.Id;
            int targetRoot = targetUser.ParentAdminId ?? targetUser.Id;

            if (myRoot != targetRoot) return Forbid();

            // Adminlerin aktivitesini sadece Root Admin görebilir (veya kendisi ise)
            if (targetUser.IsAdmin && currentUser.ParentAdminId != null && targetUser.Id != currentUser.Id)
            {
                return Forbid();
            }

            var query = db.ActivityLogs.Where(l => l.UserId == id && l.ActionTitle != "Bounce Kontrolü");

            int totalLogs = query.Count();
            var logs = query.OrderByDescending(l => l.CreatedAt)
                            .Skip((page - 1) * pageSize)
                            .Take(pageSize)
                            .Select(l => new { l.Id, l.ActionTitle, l.ActionDetail, l.CreatedAt })
                            .ToList();

            return Ok(new
            {
                logs,
                totalLogs,
                currentPage = page,
                totalPages = (int)Math.Ceiling((double)totalLogs / pageSize)
            });
        }
    }

    [HttpPost("delete-activities")]
    [Authorize]
    public IActionResult DeleteActivities([FromBody] DeleteActivitiesModel model)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int currentUserId = int.Parse(sid);

        if (model.LogIds == null || !model.LogIds.Any())
            return BadRequest(new { message = "Silinecek aktivite bulunamadı." });

        using (var db = new MailMarketingContext())
        {
            var currentUser = db.Users.Find(currentUserId);
            if (currentUser == null || !currentUser.IsAdmin) return Forbid();

            // Silinecek logları getir
            var logsToDelete = db.ActivityLogs.Where(l => model.LogIds.Contains(l.Id)).ToList();
            if (!logsToDelete.Any())
                return NotFound(new { message = "Silinecek kayıtlar bulunamadı." });

            // Sadece bu adminin yetkisi dâhilindeki kullanıcıların loglarını silmesine izin ver
            int myRoot = currentUser.ParentAdminId ?? currentUser.Id;
            foreach (var log in logsToDelete)
            {
                var targetUser = db.Users.Find(log.UserId);
                if (targetUser != null)
                {
                    int targetRoot = targetUser.ParentAdminId ?? targetUser.Id;
                    // Eğer root'lar eşleşmiyorsa bu log bu admine ait bir ekibin değil.
                    if (myRoot != targetRoot) return Forbid();
                }
            }

            db.ActivityLogs.RemoveRange(logsToDelete);
            db.SaveChanges();

            return Ok(new { message = $"{logsToDelete.Count} adet aktivite kaydı başarıyla silindi." });
        }
    }
}

public class DeleteActivitiesModel
{
    public List<int> LogIds { get; set; } = new();
}

public class LoginModel
{
    public string Email { get; set; } = null!;
    public string Password { get; set; } = null!;
    public string? Platform { get; set; }
}

public class LogoutModel
{
    public string? Platform { get; set; }
}

public class RegisterModel
{
    public string FirstName { get; set; } = null!;
    public string LastName { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string Password { get; set; } = null!;
    public string ConfirmPassword { get; set; } = null!;
    public bool IsAdmin { get; set; }
    public string? InvitationCode { get; set; }
}

public class ForgotPasswordModel
{
    public string Email { get; set; } = null!;
}

public class VerifyCodeModel
{
    public string Email { get; set; } = null!;
    public string Code { get; set; } = null!;
}

public class VerifyActivationModel
{
    public string Email { get; set; } = null!;
    public string Code { get; set; } = null!;
}

public class PendingRegistration
{
    public RegisterModel Model { get; set; } = null!;
    public string Code { get; set; } = null!;
    public DateTime ExpirationTime { get; set; }
}

public class ResendActivationModel
{
    public string Email { get; set; } = null!;
}

public class ResetPasswordModel
{
    public string Email { get; set; } = null!;
    public string Code { get; set; } = null!;
    public string NewPassword { get; set; } = null!;
    public string ConfirmPassword { get; set; } = null!;
}

public class ChangePasswordModel
{
    public string OldPassword { get; set; } = null!;
    public string NewPassword { get; set; } = null!;
    public string ConfirmPassword { get; set; } = null!;
}

public class RequestEmailChangeModel
{
    public string NewEmail { get; set; } = null!;
}

public class VerifyEmailChangeModel
{
    public string Code { get; set; } = null!;
}

public class PendingEmailChange
{
    public string NewEmail { get; set; } = null!;
    public string Code { get; set; } = null!;
    public DateTime Expiration { get; set; }
}

public class UpdateProfileInfoModel
{
    public string FirstName { get; set; } = null!;
    public string LastName { get; set; } = null!;
}

public class BrandingModel
{
    public string? DisplayName { get; set; }
    public bool IsPublic { get; set; }
}