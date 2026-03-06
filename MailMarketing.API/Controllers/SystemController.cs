using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailMarketing.DataAccess;
using MailMarketing.Entity;
using MailMarketing.Business;
using System.Security.Claims;
using System.Threading.Tasks;
using System.Linq;
using Microsoft.EntityFrameworkCore;

namespace MailMarketing.API.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class SystemController : ControllerBase
{
    private int GetCurrentUserId() => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");

    [HttpPost("check-bounces")]
    public async Task<IActionResult> CheckBounces()
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var user = db.Users.Find(userId);
            if (user == null) return Unauthorized();

            var checker = new BounceCheckManager();
            int changedCount = await checker.CheckBouncesForUserAsync(user);

            string message = changedCount > 0
                ? $"Bounce kontrolü tamamlandı. {changedCount} hatalı adres pasife alındı ve bildirim oluşturuldu."
                : "Bounce kontrolü tamamlandı. Herhangi bir değişiklik bulunamadı.";

            return Ok(new { message, changedCount });
        }
    }

    // --- NOTIFICATION ENDPOINTS ---

    [HttpGet("notifications")]
    public IActionResult GetMyNotifications()
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var notifications = db.Notifications
                .Where(n => n.UserId == userId)
                .OrderByDescending(n => n.CreatedAt)
                .Select(n => new
                {
                    n.Id,
                    n.Title,
                    Detail = n.Message, // Detail as expected by UI
                    n.IsRead,
                    n.CreatedAt
                })
                .ToList();

            return Ok(notifications);
        }
    }

    [HttpPost("notifications/read/{id}")]
    public IActionResult MarkNotificationAsRead(int id)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var notification = db.Notifications.FirstOrDefault(n => n.Id == id && n.UserId == userId);
            if (notification == null) return NotFound();

            notification.IsRead = true;
            db.SaveChanges();

            return Ok(new { message = "Bildirim okundu olarak işaretlendi." });
        }
    }

    [HttpPost("notifications/read-all")]
    public IActionResult MarkAllNotificationsAsRead()
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var unreadNotifications = db.Notifications
                .Where(n => n.UserId == userId && !n.IsRead)
                .ToList();

            foreach (var n in unreadNotifications)
            {
                n.IsRead = true;
            }

            db.SaveChanges();

            return Ok(new { message = "Tüm bildirimler okundu olarak işaretlendi." });
        }
    }

    [HttpDelete("notifications/{id}")]
    public IActionResult DeleteMyNotification(int id)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var notification = db.Notifications.FirstOrDefault(n => n.Id == id && n.UserId == userId);
            if (notification == null) return NotFound();

            db.Notifications.Remove(notification);
            db.SaveChanges();

            return Ok(new { message = "Bildirim silindi." });
        }
    }

    [HttpPost("notifications/delete-bulk")]
    public IActionResult DeleteBulkNotifications([FromBody] int[] ids)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var notificationsToDelete = db.Notifications
                .Where(n => ids.Contains(n.Id) && n.UserId == userId)
                .ToList();

            if (!notificationsToDelete.Any()) return NotFound();

            db.Notifications.RemoveRange(notificationsToDelete);
            db.SaveChanges();

            return Ok(new { message = $"{notificationsToDelete.Count} bildirim silindi." });
        }
    }
}
