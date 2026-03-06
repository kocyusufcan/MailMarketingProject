using MailMarketing.DataAccess;
using MailMarketing.Entity;

namespace MailMarketing.Business;

public static class LogManager
{
    public static void LogAction(int userId, string title, string detail)
    {
        using (var db = new MailMarketingContext())
        {
            var log = new ActivityLog
            {
                UserId = userId,
                ActionTitle = title,
                ActionDetail = detail,
                CreatedAt = DateTime.Now
            };
            db.ActivityLogs.Add(log);
            db.SaveChanges();
        }
    }
}
// 
