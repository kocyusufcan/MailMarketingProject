using Microsoft.EntityFrameworkCore;
using MailMarketing.Entity;

namespace MailMarketing.DataAccess;

public class MailMarketingContext : DbContext
{
    // Parametresiz constructor - doğrudan `new MailMarketingContext()` ile çalışma için
    public MailMarketingContext() { }

    // DI üzerinden inject edildiğinde kullanılan constructor
    public MailMarketingContext(DbContextOptions<MailMarketingContext> options) : base(options) { }

    // Veritabanı tablolarımız
    public DbSet<User> Users { get; set; }
    public DbSet<Subscriber> Subscribers { get; set; }
    public DbSet<Template> Templates { get; set; }
    public DbSet<MailLog> MailLogs { get; set; }
    public DbSet<Setting> Settings { get; set; }
    public DbSet<AppUser> AppUsers { get; set; }
    public DbSet<Notification> Notifications { get; set; }
    public DbSet<ActivityLog> ActivityLogs { get; set; }
    public DbSet<SubscriberGroup> SubscriberGroups { get; set; }
    public DbSet<SubscriberGroupMember> SubscriberGroupMembers { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        // Yalnızca DI üzerinden options gelmemişse (CLI tools için)
        if (!optionsBuilder.IsConfigured)
        {
            optionsBuilder.UseSqlServer(
                "Server=YUSUFCAN-PC\\SQLEXPRESS02;Database=MailMarketingDB;Trusted_Connection=True;TrustServerCertificate=True;");
        }
    }
}