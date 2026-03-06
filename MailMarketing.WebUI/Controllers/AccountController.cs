using Microsoft.AspNetCore.Mvc;
using MailMarketing.Business;
using MailMarketing.Entity;
using MailMarketing.DataAccess; 
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using System.Security.Claims;
using System.Threading.Tasks;
using System.Collections.Generic;
using System;
using System.Text.Json;
using System.Linq; 

namespace MailMarketing.WebUI.Controllers;

public class AccountController : Controller
{
    private readonly UserManager _userManager = new UserManager();
    private readonly MailService _mailService = new MailService(); 

    [HttpGet]
    public IActionResult Register() => View();

    [HttpPost]
    public IActionResult Register(User user, string passwordConfirm, string RoleType, string InvitedByCode)
    {
        if (user.Password != passwordConfirm)
        {
            ViewBag.Error = "Girdiğiniz parolalar birbiriyle eşleşmiyor!";
            return View();
        }

        var userExists = _userManager.CheckUserByEmail(user.Email ?? ""); 
        if (userExists)
        {
            ViewBag.Error = "Bu e-posta adresi zaten kullanımda!";
            return View();
        }

        using (var db = new MailMarketingContext())
        {
            user.IsPublic = false;

            if (!string.IsNullOrEmpty(InvitedByCode))
            {
                var anyAdminWithCode = db.Users.FirstOrDefault(u => u.AdminInvitationCode == InvitedByCode && u.IsAdmin);
                
                if (anyAdminWithCode == null)
                {
                    ViewBag.Error = "Girdiğiniz davet kodu geçersiz!";
                    return View();
                }

                var rootAdmin = anyAdminWithCode;
                while (rootAdmin.ParentAdminId != null)
                {
                    var parent = db.Users.Find(rootAdmin.ParentAdminId);
                    if (parent == null) break;
                    rootAdmin = parent;
                }

                user.ParentAdminId = rootAdmin.Id;
                user.AdminInvitationCode = rootAdmin.AdminInvitationCode;
                user.IsAdmin = (RoleType == "Admin");
            }
            else 
            {
                user.IsAdmin = true;
                user.ParentAdminId = null;
                user.AdminInvitationCode = "MM-" + new Random().Next(100000, 999999).ToString();
            }
        }

        string regCode = new Random().Next(100000, 999999).ToString();
        DateTime expiryTime = DateTime.Now.AddSeconds(60);

        try 
        {
            _mailService.SendActivationCode(user.Email!, regCode);
        }
        catch (Exception ex)
        {
            Console.WriteLine("Mail gönderme hatası: " + ex.Message);
        }

        TempData["RegUserData"] = JsonSerializer.Serialize(user);
        TempData["RegCode"] = regCode;
        TempData["RegExpiry"] = expiryTime.ToString(); 
        TempData["ConfirmPass"] = passwordConfirm;

        ViewBag.Step = 2; 
        ViewBag.Email = user.Email;
        return View();
    }

    [HttpPost]
    public IActionResult VerifyRegister(string code)
    {
        string? savedCode = TempData["RegCode"]?.ToString();
        string? expiryStr = TempData["RegExpiry"]?.ToString(); 
        string? userDataJson = TempData["RegUserData"]?.ToString();
        string? confirmPass = TempData["ConfirmPass"]?.ToString();

        if (!string.IsNullOrEmpty(expiryStr))
        {
            DateTime expiryTime = DateTime.Parse(expiryStr);
            if (DateTime.Now > expiryTime)
            {
                ViewBag.Error = "Girdiğiniz kodun süresi dolmuş. Lütfen yeni kod isteyin.";
                TempData.Keep(); 
                ViewBag.Step = 2;
                ViewBag.Email = (JsonSerializer.Deserialize<User>(userDataJson!))?.Email;
                return View("Register");
            }
        }

        if (savedCode != null && savedCode == code && !string.IsNullOrEmpty(userDataJson))
        {
            var user = JsonSerializer.Deserialize<User>(userDataJson);
            if (user != null) user.IsPublic = false;

            string result = _userManager.Register(user!, confirmPass!);
            
            if (result == "OK")
            {
                TempData["Message"] = "Kayıt tamamlandı. Şimdi giriş yapabilirsin.";
                return RedirectToAction("Login");
            }
            ViewBag.Error = result;
        }
        else
        {
            ViewBag.Error = "Girdiğiniz doğrulama kodu hatalı!";
        }

        TempData.Keep(); 
        ViewBag.Step = 2;
        ViewBag.Email = (JsonSerializer.Deserialize<User>(userDataJson!))?.Email;
        return View("Register");
    }

    [HttpPost]
    public IActionResult ResendActivationCode()
    {
        TempData.Keep("RegUserData");
        TempData.Keep("ConfirmPass");

        string? userDataJson = TempData["RegUserData"]?.ToString();
        if (string.IsNullOrEmpty(userDataJson))
        {
            return Json(new { success = false, message = "Oturum süresi dolmuş. Lütfen formu tekrar doldurun." });
        }

        var user = JsonSerializer.Deserialize<User>(userDataJson);
        if (user == null) return Json(new { success = false, message = "Kullanıcı verisi okunamadı." });

        string newCode = new Random().Next(100000, 999999).ToString();
        DateTime newExpiry = DateTime.Now.AddSeconds(60);

        try 
        {
            _mailService.SendActivationCode(user.Email!, newCode);
            
            TempData["RegCode"] = newCode;
            TempData["RegExpiry"] = newExpiry.ToString(); 
            TempData.Keep();

            return Json(new { success = true });
        }
        catch (Exception ex)
        {
            return Json(new { success = false, message = "Mail gönderimi başarısız: " + ex.Message });
        }
    }

    [HttpGet]
    public IActionResult Login() => View();

    [HttpPost]
    public async Task<IActionResult> Login(string email, string password, bool rememberMe)
    {
        try 
        {
            var userExists = _userManager.CheckUserByEmail(email);
            if (!userExists)
            {
                ViewBag.Error = "Mail adresi sistemde kayıtlı değil!";
                return View();
            }

            User? user = _userManager.Login(email, password);
            if (user == null)
            {
                ViewBag.Error = "Parola doğru değil!";
                return View();
            }

            if (!user.IsActive)
            {
                ViewBag.Error = "Hesabınız pasife alınmış.";
                return View();
            }

            string realFullName = $"{user.FirstName} {user.LastName}";

            var claims = new List<Claim> 
            { 
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email ?? ""),
                new Claim(ClaimTypes.Name, realFullName), 
                new Claim("FullName", realFullName),
                new Claim("FirstName", user.FirstName ?? ""),
                new Claim("LastName", user.LastName ?? ""),
                new Claim("AdminCode", user.AdminInvitationCode ?? ""),
                new Claim(ClaimTypes.Role, user.IsAdmin ? "Admin" : "User")
            };

            var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            
            var authProperties = new AuthenticationProperties 
            { 
                IsPersistent = rememberMe, 
                ExpiresUtc = rememberMe ? DateTime.UtcNow.AddDays(30) : DateTime.UtcNow.AddMinutes(60), 
                AllowRefresh = true 
            };

            await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(claimsIdentity), authProperties);

            LogManager.LogAction(user.Id, "Oturum Açıldı", "Sisteme giriş yapıldı (Web Sitesi).");

            return RedirectToAction("Index", "Home");
        }
        catch (Exception ex) 
        { 
            ViewBag.Error = "Hata: " + ex.Message; 
            return View();
        }
    }

    [HttpGet]
    public IActionResult ForgotPassword() => View();

    // Şifre sıfırlama (başlangıç)
    [HttpPost]
    public IActionResult ForgotPassword(string email)
    {
        var userExists = _userManager.CheckUserByEmail(email); 
        if (userExists)
        {
            string verificationCode = new Random().Next(100000, 999999).ToString();
            
            // Süre ve kod ayarları
            TempData["PassVerifyExpiry"] = DateTime.Now.AddSeconds(60).ToString();
            TempData["VerificationCode"] = verificationCode;
            TempData["TargetEmail"] = email;
            TempData.Keep(); // Verileri koru

            try 
            {
                // şifre sıfırlama kodunu gönder
                _mailService.SendForgotPasswordCode(email, verificationCode);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Mail hatası: " + ex.Message);
            }

            ViewBag.Step = 2; 
            ViewBag.Email = email;
            ViewBag.RemainingTime = 60; // JS için süre
            return View();
        }
        ViewBag.Error = "Kullanıcı bulunamadı!";
        return View();
    }

    // Doğrulama (Süre kontrolcü)
    [HttpPost]
    public IActionResult VerifyCode(string email, string code)
    {
        string? savedCode = TempData["VerificationCode"]?.ToString();
        string? expiryStr = TempData["PassVerifyExpiry"]?.ToString();
        
        TempData.Keep();

        // 1. SÜRE KONTROLÜ
        int remainingSeconds = 0;
        if (!string.IsNullOrEmpty(expiryStr))
        {
            DateTime expiryTime = DateTime.Parse(expiryStr);
            remainingSeconds = (int)(expiryTime - DateTime.Now).TotalSeconds;
        }
        if (remainingSeconds < 0) remainingSeconds = 0;

        if (remainingSeconds == 0)
        {
            ViewBag.Error = "Kodun süresi dolmuş. Lütfen yeni kod isteyin.";
            ViewBag.Step = 2;
            ViewBag.Email = email;
            ViewBag.RemainingTime = 0;
            ViewBag.TimerExpired = true; // JS için kilit bayrağı
            return View("ForgotPassword");
        }

        // 2. KOD KONTROLÜ
        if (!string.IsNullOrEmpty(savedCode) && savedCode == code)
        {
            ViewBag.Step = 3; 
            ViewBag.Email = email;
            return View("ForgotPassword");
        }

        ViewBag.Error = "Kod hatalı!";
        ViewBag.Step = 2;
        ViewBag.Email = email;
        ViewBag.RemainingTime = remainingSeconds; // Kalan süreyle devam et
        return View("ForgotPassword");
    }

    // şifre kodunu yeniden gönder (AJAX)
    [HttpPost]
    public IActionResult ResendForgotPasswordCode()
    {
        string? email = TempData["TargetEmail"]?.ToString();
        
        if (string.IsNullOrEmpty(email)) return Json(new { success = false, message = "Oturum süresi dolmuş." });

        string newCode = new Random().Next(100000, 999999).ToString();
        
        TempData["VerificationCode"] = newCode;
        TempData["PassVerifyExpiry"] = DateTime.Now.AddSeconds(60).ToString();
        TempData["TargetEmail"] = email; // Tekrar sakla
        TempData.Keep();

        try {
            _mailService.SendForgotPasswordCode(email, newCode);
            return Json(new { success = true });
        } catch {
            return Json(new { success = false, message = "Mail gönderilemedi." });
        }
    }

    [HttpPost]
    public IActionResult ResetPassword(string email, string newPassword, string passwordConfirm)
    {
        string result = _userManager.UpdatePassword(email, newPassword, passwordConfirm);
        if (result == "OK")
        {
            using(var db = new MailMarketingContext())
            {
                var user = db.Users.FirstOrDefault(u => u.Email == email);
                if(user != null) LogManager.LogAction(user.Id, "Parola Yenileme", "Kullanıcı parolasını başarıyla sıfırladı.");
            }

            TempData["Message"] = "Parolanız yenilendi!";
            return RedirectToAction("Login");
        }
        ViewBag.Error = result;
        ViewBag.Step = 3; 
        ViewBag.Email = email;
        return View("ForgotPassword");
    }

    public async Task<IActionResult> Logout()
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if(!string.IsNullOrEmpty(sid)) LogManager.LogAction(int.Parse(sid), "Oturum Kapatıldı", "Sistemden güvenli çıkış yapıldı (Web Sitesi).");

        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return RedirectToAction("Index", "Home"); 
    }

    public IActionResult Profile() => RedirectToAction("Profile", "User");
}