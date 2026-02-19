using MailMarketing.DataAccess;
using MailMarketing.Entity;
using Microsoft.EntityFrameworkCore;

namespace MailMarketing.Business;

public class MailLogManager
{
    private readonly MailMarketingContext _context = new MailMarketingContext();

    public List<MailLog> GetAllLogs()
    {
        // Logları, abone ve şablon bilgileriyle birlikte en yeni en üstte olacak şekilde getiriyoruz
        return _context.MailLogs
            .Include(x => x.Subscriber)
            .Include(x => x.Template)
            .OrderByDescending(x => x.SentDate)
            .ToList();
    }
}