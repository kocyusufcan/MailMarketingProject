using Microsoft.AspNetCore.Mvc;
using MailMarketing.DataAccess;
using MailMarketing.Entity;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using System;
using System.Collections.Generic;
using OfficeOpenXml; 
using OfficeOpenXml.Style; 
using MailMarketing.Business;

namespace MailMarketing.WebUI.Controllers;

[Authorize]
public class MailLogController : Controller
{
    // 1. LİSTELEME VE GELİŞMİŞ FİLTRELEME
    public IActionResult Index(string search, string status = "all", int? templateId = null, DateTime? startDate = null, DateTime? endDate = null, int? userId = null, int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        int queryUserId = currentUserId;
        if (userId.HasValue && User.IsInRole("Admin"))
        {
            queryUserId = userId.Value;
        }

        using (var db = new MailMarketingContext())
        {
            // Kullanıcı adını UI'da göstermek için (Admin başka kullanıcının raporunu görüntülüyorsa)
            if (queryUserId != currentUserId)
            {
                var targetUser = db.Users.Find(queryUserId);
                if (targetUser != null)
                {
                    ViewBag.TargetUserName = !string.IsNullOrEmpty(targetUser.DisplayName) ? targetUser.DisplayName : $"{targetUser.FirstName} {targetUser.LastName}";
                }
            }

            ViewBag.Templates = db.Templates
                                  .Where(t => t.UserId == queryUserId)
                                  .OrderBy(t => t.Title)
                                  .AsNoTracking()
                                  .ToList();

            var query = db.MailLogs
                           .Include(l => l.Template)
                           .Include(l => l.Subscriber)
                           .Where(l => l.Template != null && l.Template.UserId == queryUserId)
                           .AsQueryable();

#pragma warning disable CS8602 
            if (!string.IsNullOrEmpty(search))
            {
                query = query.Where(l => l.Subscriber != null && 
                                          ((l.Subscriber.FirstName + " " + l.Subscriber.LastName).Contains(search) || 
                                           l.Subscriber.Email.Contains(search)));
            }
#pragma warning restore CS8602

            if (templateId.HasValue && templateId > 0)
            {
                query = query.Where(l => l.TemplateId == templateId.Value);
            }

            if (status == "success") query = query.Where(l => l.IsSuccess);
            else if (status == "error") query = query.Where(l => l.IsSuccess == false);

            if (startDate.HasValue) query = query.Where(l => l.SentDate >= startDate.Value.Date);
            if (endDate.HasValue)
            {
                var endOfRange = endDate.Value.Date.AddDays(1).AddTicks(-1);
                query = query.Where(l => l.SentDate <= endOfRange);
            }

            int pageSize = 20;
            int totalRecords = query.Count();
            int totalPages = (int)Math.Ceiling(totalRecords / (double)pageSize);
            page = page < 1 ? 1 : (page > totalPages && totalPages > 0 ? totalPages : page);

            var logs = query.OrderByDescending(l => l.SentDate)
                            .Skip((page - 1) * pageSize)
                            .Take(pageSize)
                            .AsNoTracking()
                            .ToList();

            ViewBag.Search = search;
            ViewBag.CurrentStatus = status;
            ViewBag.SelectedTemplateId = templateId;
            ViewBag.StartDate = startDate?.ToString("yyyy-MM-dd");
            ViewBag.EndDate = endDate?.ToString("yyyy-MM-dd");
            ViewBag.CurrentPage = page;
            ViewBag.TotalPages = totalPages;
            ViewBag.TotalRecords = totalRecords;
            ViewBag.TargetUserId = userId; // Sayfalandırma ve export gibi işlemler için

            return View(logs);
        }
    }

    [HttpGet]
    public IActionResult GetLogDetail(int id, int? userId = null)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        int queryUserId = currentUserId;
        if (userId.HasValue && User.IsInRole("Admin"))
        {
            queryUserId = userId.Value;
        }

        using (var db = new MailMarketingContext())
        {
            var log = db.MailLogs
                        .Include(l => l.Subscriber)
                        .Include(l => l.Template)
                        .FirstOrDefault(l => l.Id == id && l.Template != null && l.Template.UserId == queryUserId);

            if (log == null) return NotFound();

            return PartialView("_LogDetail", log);
        }
    }

    // 2. EXCEL AKTARIM (GÜNCELLENDİ: Şablon İsmi Loglanıyor)
    public IActionResult ExportToExcel(string search, string status, int? templateId, DateTime? startDate, DateTime? endDate, int? userId = null)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        int queryUserId = currentUserId;
        if (userId.HasValue && User.IsInRole("Admin"))
        {
            queryUserId = userId.Value;
        }

        using (var db = new MailMarketingContext())
        {
            var query = db.MailLogs
                           .Include(l => l.Template)
                           .Include(l => l.Subscriber)
                           .Where(l => l.Template != null && l.Template.UserId == queryUserId)
                           .AsQueryable();

#pragma warning disable CS8602
            if (!string.IsNullOrEmpty(search)) 
            {
                query = query.Where(l => l.Subscriber != null && 
                                          ((l.Subscriber.FirstName + " " + l.Subscriber.LastName).Contains(search) || 
                                           l.Subscriber.Email.Contains(search)));
            }
#pragma warning restore CS8602

            if (templateId.HasValue && templateId > 0) query = query.Where(l => l.TemplateId == templateId);
            if (status == "success") query = query.Where(l => l.IsSuccess);
            else if (status == "error") query = query.Where(l => l.IsSuccess == false);
            if (startDate.HasValue) query = query.Where(l => l.SentDate >= startDate.Value.Date);
            if (endDate.HasValue) query = query.Where(l => l.SentDate <= endDate.Value.Date.AddDays(1).AddTicks(-1));

            var data = query.OrderByDescending(l => l.SentDate).AsNoTracking().ToList();

            // Şablon ismini ID'den bul ve log detayına ekle
            string templateName = "Tümü";
            if (templateId.HasValue && templateId > 0)
            {
                var temp = db.Templates.FirstOrDefault(t => t.Id == templateId);
                templateName = temp?.Title ?? "Bilinmeyen Şablon";
            }

            // Log: Filtre detaylarını yaz
            string filterInfo = $"Durum: {status}";
            if (templateId.HasValue && templateId > 0) filterInfo += $", Şablon: {templateName}";
            if (startDate.HasValue) filterInfo += $", Başlangıç: {startDate.Value:dd.MM.yyyy}";
            if (endDate.HasValue) filterInfo += $", Bitiş: {endDate.Value:dd.MM.yyyy}";

            LogManager.LogAction(currentUserId, "Excel Aktarımı", $"'{filterInfo}' kriterleri kullanılarak {data.Count} adet gönderim raporu Excel'e aktarıldı.");

            using (var package = new ExcelPackage())
            {
                var worksheet = package.Workbook.Worksheets.Add("Gönderim Raporu");
                string[] headers = { "Ad Soyad", "E-Posta", "Şablon", "Tarih", "Durum", "Açıklama" };

                for (int i = 0; i < headers.Length; i++)
                {
                    var cell = worksheet.Cells[1, i + 1];
                    cell.Value = headers[i];
                    cell.Style.Font.Bold = true;
                    cell.Style.Fill.PatternType = ExcelFillStyle.Solid;
                    cell.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
                    cell.Style.Border.BorderAround(ExcelBorderStyle.Thin);
                }

                int row = 2;
                foreach (var item in data)
                {
                    worksheet.Cells[row, 1].Value = item.Subscriber != null ? $"{item.Subscriber.FirstName} {item.Subscriber.LastName}" : "Bilinmeyen";
                    worksheet.Cells[row, 2].Value = item.Subscriber?.Email ?? "-";
                    worksheet.Cells[row, 3].Value = item.Template?.Title ?? "Silinmiş";
                    worksheet.Cells[row, 4].Value = item.SentDate.ToString("dd.MM.yyyy HH:mm");
                    worksheet.Cells[row, 5].Value = item.IsSuccess ? "Başarılı" : "Hata";
                    worksheet.Cells[row, 6].Value = item.ErrorMessage ?? "İletildi";
                    row++;
                }

                worksheet.Cells[worksheet.Dimension.Address].AutoFitColumns();
                var fileBytes = package.GetAsByteArray();
                return File(fileBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"Rapor_{DateTime.Now:ddMMyyyy_HHmm}.xlsx");
            }
        }
    }

    // 3. TEKLİ SİLME
    public IActionResult Delete(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var log = db.MailLogs.Find(id);
            if (log != null)
            {
                db.MailLogs.Remove(log);
                db.SaveChanges();

                LogManager.LogAction(currentUserId, "Rapor Silindi", "Bir adet gönderim raporu kaydı silindi.");
                
                TempData["Message"] = "Kayıt silindi.";
            }
        }
        return RedirectToAction("Index");
    }

    // 4. TÜMÜNÜ TEMİZLE
    public IActionResult ClearAll()
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var userLogs = db.MailLogs.Where(l => l.Template != null && l.Template.UserId == currentUserId).ToList();
            int count = userLogs.Count;

            if (userLogs.Any())
            {
                db.MailLogs.RemoveRange(userLogs);
                db.SaveChanges();

                LogManager.LogAction(currentUserId, "Raporlar Temizlendi", $"Kullanıcıya ait tüm gönderim geçmişi ({count} kayıt) kalıcı olarak temizlendi.");

                TempData["Message"] = "Geçmiş temizlendi.";
            }
        }
        return RedirectToAction("Index");
    }

    // 5. TOPLU SİLME
    [HttpPost]
    public IActionResult BulkDelete(int[] selectedIds)
    {
        if (selectedIds != null && selectedIds.Length > 0)
        {
            var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
            int currentUserId = int.Parse(sid!);

            using (var db = new MailMarketingContext())
            {
                var logsToDelete = db.MailLogs.Where(l => selectedIds.Contains(l.Id)).ToList();
                int count = logsToDelete.Count;

                db.MailLogs.RemoveRange(logsToDelete);
                db.SaveChanges();

                LogManager.LogAction(currentUserId, "Toplu Rapor Silme", $"{count} adet gönderim raporu seçilerek silindi.");

                TempData["Message"] = $"{count} kayıt silindi.";
            }
        }
        return RedirectToAction("Index");
    }
}