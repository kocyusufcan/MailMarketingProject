using Microsoft.AspNetCore.Authentication.Cookies;
using MailMarketing.WebUI.Services;
// using OfficeOpenXml; 

var builder = WebApplication.CreateBuilder(args);

// 1. Giriş sistemini (Cookie tabanlı) sisteme tanıtıyoruz
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Account/Login"; 
        options.LogoutPath = "/Account/Logout";
        options.Cookie.Name = "MailMarketingAuth"; 
        
        // Cookie süresini güncelliyoruz
        options.ExpireTimeSpan = TimeSpan.FromDays(30); // Varsayılan ömür 30 gün olsun (Login'de override edilebilir)
        options.SlidingExpiration = true; // Kullanıcı sitede gezdikçe süre otomatik uzasın
        options.Cookie.HttpOnly = true; // Güvenlik için (Javascript erişemez)
        options.Cookie.IsEssential = true; // GDPR uyumu için
    });

// Servisleri ekle
builder.Services.AddControllersWithViews();

// ASENKRON MAİL MOTORU
builder.Services.AddHostedService<MailBackgroundWorker>();

// EPPlus 8+ lisans yapılandırması (NonCommercial ortam değişkeni)
Environment.SetEnvironmentVariable("EPPlusLicenseContext", "NonCommercial");

var app = builder.Build();

// Pipeline yapılandırması
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();

// 2. Kimlik doğrulama ve Yetkilendirme
app.UseAuthentication(); 
app.UseAuthorization();  

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();