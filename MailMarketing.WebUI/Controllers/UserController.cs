using Microsoft.AspNetCore.Mvc;
using MailMarketing.DataAccess;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using MailMarketing.Business; 
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;

namespace MailMarketing.WebUI.Controllers;

[Authorize]
public class UserController : Controller
{
    private readonly MailService _mailService = new MailService(); 

    private bool IsPasswordValid(string? password)
    {
        if (string.IsNullOrEmpty(password)) return true;
        var regex = new Regex(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$");
        return regex.IsMatch(password);
    }

    [Authorize(Roles = "Admin")]
    public IActionResult Index()
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var currentUser = db.Users.Find(currentUserId);
            if (currentUser == null) return RedirectToAction("Logout", "Account");

            ViewBag.IsRootAdmin = currentUser.ParentAdminId == null;

            IQueryable<MailMarketing.Entity.User> usersQuery;

            if (currentUser.ParentAdminId == null)
            {
                usersQuery = db.Users.Where(u => u.ParentAdminId == currentUserId || u.Id == currentUserId);
            }
            else
            {
                usersQuery = db.Users.Where(u => 
                    u.Id == currentUserId || 
                    (u.ParentAdminId == currentUser.ParentAdminId && u.IsAdmin == false)
                );
            }

            var users = usersQuery.OrderBy(u => u.FirstName ?? "ZZZ").ToList();

            foreach (var user in users)
            {
                if (!string.IsNullOrEmpty(user.Password))
                {
                    try { user.Password = PasswordHasher.Decrypt(user.Password); } catch { }
                }
            }
            return View(users);
        }
    }

    [HttpGet]
    public IActionResult Profile()
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return RedirectToAction("Login", "Account");

        using (var db = new MailMarketingContext())
        {
            var accountInfo = db.Users.Find(int.Parse(sid));
            if (accountInfo == null) return RedirectToAction("Login", "Account");
            return View(accountInfo);
        }
    }

    [HttpPost]
    public IActionResult UpdateProfile(string DisplayName, string FirstName, string LastName, string Email, string CurrentPassword, string NewPassword, string ShowInBulletin)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var userInDb = db.Users.Find(currentUserId);
            if (userInDb == null) return RedirectToAction("Profile");

            userInDb.DisplayName = DisplayName?.Trim(); 
            userInDb.FirstName = FirstName.Trim();
            userInDb.LastName = LastName.Trim();
            userInDb.IsPublic = (ShowInBulletin == "on");

            if (!string.IsNullOrEmpty(NewPassword))
            {
                string storedPassDecrypted = "";
                try { storedPassDecrypted = PasswordHasher.Decrypt(userInDb.Password!); } catch { }

                if (string.IsNullOrEmpty(CurrentPassword) || CurrentPassword != storedPassDecrypted)
                {
                    TempData["Error"] = "Mevcut şifrenizi yanlış girdiniz!";
                    return RedirectToAction("Profile");
                }

                if (!IsPasswordValid(NewPassword))
                {
                    TempData["Error"] = "Yeni şifre en az 8 karakter, büyük harf ve sayı içermelidir.";
                    return RedirectToAction("Profile");
                }

                userInDb.Password = PasswordHasher.Encrypt(NewPassword);
            }

            string cleanEmail = Email.Trim().ToLower();
            if (userInDb.Email!.ToLower() != cleanEmail)
            {
                if (db.Users.Any(u => u.Email!.ToLower() == cleanEmail && u.Id != currentUserId))
                {
                    TempData["Error"] = "Bu e-posta adresi zaten kullanımda!";
                    return RedirectToAction("Profile");
                }

                string verCode = new Random().Next(100000, 999999).ToString();
                
                // Süre başlangıcı
                TempData["EmailVerifyExpiry"] = DateTime.Now.AddSeconds(60).ToString();
                TempData["EmailVerifyCode"] = verCode; 
                
                // Önemli: Kime mail atılacağını TempData'ya kaydediyoruz (Resend için gerekli)
                TempData["PendingEmail"] = cleanEmail;

                try {
                    _mailService.SendEmailChangeCode(cleanEmail, verCode);
                } catch { /* Mail hatası loglanabilir */ }

                ViewBag.Step = 2;
                ViewBag.CorrectCode = verCode; 
                ViewBag.NewEmail = cleanEmail;
                ViewBag.NewFName = FirstName;
                ViewBag.NewLName = LastName;
                ViewBag.NewDName = DisplayName; 
                ViewBag.IsPublicValue = userInDb.IsPublic;
                
                ViewBag.RemainingTime = 60;
                
                return View("Profile", userInDb);
            }

            userInDb.Email = cleanEmail;
            db.SaveChanges();

            LogManager.LogAction(userInDb.Id, "Profil Güncellendi", $"Kullanıcı profil bilgilerini ({userInDb.Email}) güncelledi.");
            TempData["Message"] = "Profil başarıyla güncellendi.";
            
            return RedirectToAction("Profile");
        }
    }

    [HttpPost]
    public async Task<IActionResult> VerifyEmailChange(string code, string correctCode, string newEmail, string fName, string lName, string dName, bool isPublicValue)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var userForView = db.Users.Find(currentUserId);

            string? expiryStr = TempData["EmailVerifyExpiry"]?.ToString();
            string? serverCode = TempData["EmailVerifyCode"]?.ToString();

            // Verileri koru
            TempData.Keep("EmailVerifyExpiry");
            TempData.Keep("EmailVerifyCode");
            TempData.Keep("PendingEmail"); // E-postayı da koru

            // Kalan süreyi hesapla
            int remainingSeconds = 0;
            if (!string.IsNullOrEmpty(expiryStr))
            {
                DateTime expiryTime = DateTime.Parse(expiryStr);
                TimeSpan diff = expiryTime - DateTime.Now;
                remainingSeconds = (int)diff.TotalSeconds;
            }
            if (remainingSeconds < 0) remainingSeconds = 0;

            ViewBag.RemainingTime = remainingSeconds;

            // 1. SÜRE KONTROLÜ
            if (remainingSeconds == 0)
            {
                TempData["Error"] = "Kodun süresi dolmuş. Lütfen 'Yeni Kod Gönder' butonunu kullanın.";
                
                ViewBag.Step = 2;
                ViewBag.TimerExpired = true; 
                
                ViewBag.CorrectCode = serverCode ?? correctCode;
                ViewBag.NewEmail = newEmail;
                ViewBag.NewFName = fName;
                ViewBag.NewLName = lName;
                ViewBag.NewDName = dName;
                ViewBag.IsPublicValue = isPublicValue;

                return View("Profile", userForView);
            }

            // 2. KOD KONTROLÜ
            string codeToVerify = !string.IsNullOrEmpty(serverCode) ? serverCode : correctCode;

            if (code != codeToVerify)
            {
                TempData["Error"] = "Girdiğiniz doğrulama kodu hatalı!";
                
                ViewBag.Step = 2;
                // TimerExpired yok -> Süre devam etsin
                
                ViewBag.CorrectCode = codeToVerify;
                ViewBag.NewEmail = newEmail;
                ViewBag.NewFName = fName;
                ViewBag.NewLName = lName;
                ViewBag.NewDName = dName;
                ViewBag.IsPublicValue = isPublicValue;

                return View("Profile", userForView);
            }

            // 3. BAŞARILI
            if (userForView != null)
            {
                userForView.Email = newEmail;
                userForView.FirstName = fName;
                userForView.LastName = lName;
                userForView.DisplayName = dName;
                userForView.IsPublic = isPublicValue;

                db.SaveChanges();
                
                LogManager.LogAction(userForView.Id, "E-posta Değiştirildi", $"Mail adresi '{newEmail}' olarak başarıyla güncellendi.");

                var identity = (ClaimsIdentity)User.Identity!;
                var emailClaim = identity.FindFirst(ClaimTypes.Email);
                if (emailClaim != null) identity.RemoveClaim(emailClaim);
                identity.AddClaim(new Claim(ClaimTypes.Email, newEmail));

                await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
                
                TempData["Message"] = "E-posta adresiniz doğrulandı ve profiliniz güncellendi.";
                
                // Başarılı olunca temp verileri silebiliriz (Otomatik silinir zaten)
            }
        }
        return RedirectToAction("Profile");
    }

    // Yeniden kod gönderme
    [HttpPost]
    public IActionResult ResendVerifyCode()
    {
        // 1. Kime göndereceğimizi bul
        string? targetEmail = TempData["PendingEmail"]?.ToString();

        if (string.IsNullOrEmpty(targetEmail))
        {
            return Json(new { success = false, message = "Oturum süresi dolmuş. Lütfen işlemi iptal edip tekrar deneyin." });
        }

        string newCode = new Random().Next(100000, 999999).ToString();
        
        // 2. Süreyi ve kodu güncelle (Tekrar 60 sn)
        TempData["EmailVerifyExpiry"] = DateTime.Now.AddSeconds(60).ToString();
        TempData["EmailVerifyCode"] = newCode;
        TempData["PendingEmail"] = targetEmail; // Tekrar sakla
        TempData.Keep(); 

        // 3. Kodu gönder
        try {
            _mailService.SendEmailChangeCode(targetEmail, newCode);
            return Json(new { success = true, message = "Kod gönderildi." });
        }
        catch (Exception ex)
        {
            return Json(new { success = false, message = "Mail gönderilemedi: " + ex.Message });
        }
    }

    [HttpPost]
    public IActionResult ChangeAdmin(string invitationCode)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        if (string.IsNullOrEmpty(invitationCode))
        {
            TempData["Error"] = "Lütfen geçerli bir davet kodu giriniz.";
            return RedirectToAction("Profile");
        }

        using (var db = new MailMarketingContext())
        {
            var newAdmin = db.Users.FirstOrDefault(u => u.AdminInvitationCode == invitationCode && u.IsAdmin);

            if (newAdmin == null)
            {
                TempData["Error"] = "Geçersiz veya hatalı davet kodu!";
                return RedirectToAction("Profile");
            }

            var rootAdminOfNewTeam = newAdmin;
            while (rootAdminOfNewTeam.ParentAdminId != null)
            {
                var parent = db.Users.Find(rootAdminOfNewTeam.ParentAdminId);
                if (parent == null) break;
                rootAdminOfNewTeam = parent;
            }

            var currentUser = db.Users.Find(currentUserId);
            if (currentUser != null)
            {
                if (currentUser.ParentAdminId == rootAdminOfNewTeam.Id)
                {
                    TempData["Error"] = "Zaten bu organizasyonun bir parçasısınız.";
                    return RedirectToAction("Profile");
                }

                string oldRootName = db.Users.Find(currentUser.ParentAdminId)?.FirstName ?? "Bağımsız";
                currentUser.ParentAdminId = rootAdminOfNewTeam.Id;
                currentUser.IsAdmin = false; 
                db.SaveChanges();

                LogManager.LogAction(currentUser.Id, "Firma Değişikliği", $"Kullanıcı '{oldRootName}' ekibinden ayrılıp '{rootAdminOfNewTeam.FirstName}' organizasyonuna katıldı.");
                TempData["Message"] = "Organizasyon geçişi başarılı.";
            }
        }
        return RedirectToAction("Profile");
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public IActionResult ToggleAdmin(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        if (currentUserId == id) return BadRequest(); 

        using (var db = new MailMarketingContext())
        {
            var adminUser = db.Users.Find(currentUserId);
            var targetUser = db.Users.Find(id);

            if (adminUser == null || targetUser == null) return NotFound();

            int myRoot = adminUser.ParentAdminId ?? adminUser.Id;
            int targetRoot = targetUser.ParentAdminId ?? targetUser.Id;

            if (myRoot == targetRoot) 
            { 
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
                
                return Ok(); 
            }
        }
        return Forbid();
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public IActionResult ToggleStatus(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        if (currentUserId == id) return BadRequest();

        using (var db = new MailMarketingContext())
        {
            var currentUser = db.Users.Find(currentUserId);
            var targetUser = db.Users.Find(id);

            if (currentUser == null || targetUser == null) return NotFound();

            int myRoot = currentUser.ParentAdminId ?? currentUser.Id;
            int targetRoot = targetUser.ParentAdminId ?? targetUser.Id;

            if (myRoot == targetRoot) 
            { 
                if (targetUser.Id == myRoot && currentUser.Id != myRoot) return Forbid();

                targetUser.IsActive = !targetUser.IsActive; 
                db.SaveChanges(); 
                
                string durum = targetUser.IsActive ? "aktife" : "pasife";
                LogManager.LogAction(currentUserId, "Kullanıcı Durumu Değişti", $"'{targetUser.Email}' kullanıcısı {durum} alındı.");
                
                return Ok(); 
            }
        }
        return Forbid();
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public IActionResult Delete(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        if (currentUserId == id) return RedirectToAction("Index");

        using (var db = new MailMarketingContext())
        {
            var currentUser = db.Users.Find(currentUserId);
            var targetUser = db.Users.Find(id);

            if (currentUser == null || targetUser == null) return NotFound();

            int myRoot = currentUser.ParentAdminId ?? currentUser.Id;
            int targetRoot = targetUser.ParentAdminId ?? targetUser.Id;

            if (myRoot == targetRoot) 
            { 
                if (targetUser.Id == myRoot && currentUser.Id != myRoot) return Forbid();

                string targetEmail = targetUser.Email ?? "Bilinmeyen";
                CleanupUserData(db, id); 

                db.Users.Remove(targetUser); 
                db.SaveChanges(); 

                LogManager.LogAction(currentUserId, "Kullanıcı Silindi", $"'{targetEmail}' kullanıcısı ve tüm bağlı verileri kalıcı olarak silindi.");
                
                TempData["Message"] = "Kullanıcı ve bağlı tüm veriler başarıyla silindi."; 
            }
        }
        return RedirectToAction("Index");
    }

    [HttpPost]
    public async Task<IActionResult> DeleteMyAccount()
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return RedirectToAction("Login", "Account");
        int currentUserId = int.Parse(sid);

        using (var db = new MailMarketingContext())
        {
            var user = db.Users.Find(currentUserId);
            if (user != null)
            {
                string myEmail = user.Email ?? "";
                CleanupUserData(db, currentUserId);
                db.Users.Remove(user);
                db.SaveChanges();
            }
        }

        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        TempData["Message"] = "Hesabınız başarıyla silindi. Hoşça kalın!";
        return RedirectToAction("Index", "Home");
    }

    private void CleanupUserData(MailMarketingContext db, int userId)
    {
        var activityLogs = db.ActivityLogs.Where(l => l.UserId == userId);
        db.ActivityLogs.RemoveRange(activityLogs);

        var userSubscribers = db.Subscribers.Where(s => s.UserId == userId).Select(s => s.Id).ToList();

        var mailLogs = db.MailLogs.Where(l => l.SubscriberId.HasValue && userSubscribers.Contains(l.SubscriberId.Value));
        db.MailLogs.RemoveRange(mailLogs);

        var groups = db.SubscriberGroups.Where(g => g.UserId == userId).ToList();
        foreach (var g in groups)
        {
            var members = db.SubscriberGroupMembers.Where(m => m.GroupId == g.Id);
            db.SubscriberGroupMembers.RemoveRange(members);
        }
        db.SubscriberGroups.RemoveRange(groups);

        db.Subscribers.RemoveRange(db.Subscribers.Where(s => s.UserId == userId));
        db.Templates.RemoveRange(db.Templates.Where(t => t.UserId == userId));
    }

    [Authorize(Roles = "Admin")]
    public IActionResult Activity(int id, int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        int pageSize = 15; 

        using (var db = new MailMarketingContext())
        {
            var targetUser = db.Users.Find(id);
            var currentUser = db.Users.Find(currentUserId);
            
            if (targetUser == null || currentUser == null) return NotFound();

            int myRootId = currentUser.ParentAdminId ?? currentUser.Id;
            int targetRootId = targetUser.ParentAdminId ?? targetUser.Id;

            if (myRootId != targetRootId) return Forbid();

            if (targetUser.IsAdmin && currentUser.ParentAdminId != null && targetUser.Id != currentUser.Id) 
            {
                return Forbid();
            }

            var query = db.ActivityLogs.Where(l => l.UserId == id && l.ActionTitle != "Bounce Kontrolü");

            int totalLogs = query.Count();

            var logs = query.OrderByDescending(l => l.CreatedAt)
                            .Skip((page - 1) * pageSize)
                            .Take(pageSize)
                            .ToList();

            ViewBag.TargetUser = $"{targetUser.FirstName} {targetUser.LastName}";
            ViewBag.TargetId = id;
            ViewBag.CurrentPage = page;
            ViewBag.TotalPages = (int)Math.Ceiling((double)totalLogs / pageSize);

            return View(logs);
        }
    }
}