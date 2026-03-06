using Microsoft.AspNetCore.Mvc;
using MailMarketing.Business;
using MailMarketing.Entity;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using MailMarketing.DataAccess;
using System.Linq;
using OfficeOpenXml; 
using System.IO; 
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace MailMarketing.WebUI.Controllers;

[Authorize]
public class SubscriberController : Controller
{
    private readonly SubscriberManager _subscriberManager = new SubscriberManager();

    // Abone Listesi (Genel)
    public IActionResult Index(string? searchString, DateTime? startDate, DateTime? endDate, int? groupId, string? status, int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            ViewBag.Groups = db.SubscriberGroups
                               .Where(g => g.UserId == currentUserId)
                               .OrderBy(g => g.GroupName)
                               .Take(20) 
                               .ToList();

            var query = db.Subscribers.Where(s => s.UserId == currentUserId).AsQueryable();

            if (status == "active") query = query.Where(s => s.IsActive);
            else if (status == "passive") query = query.Where(s => !s.IsActive);
            ViewBag.CurrentStatus = status;

            if (groupId.HasValue)
            {
                ViewBag.SelectedGroupObject = db.SubscriberGroups.FirstOrDefault(g => g.Id == groupId && g.UserId == currentUserId);

                var memberIds = db.SubscriberGroupMembers
                                  .Where(m => m.GroupId == groupId.Value)
                                  .Select(m => m.SubscriberId)
                                  .ToList();
                
                query = query.Where(s => memberIds.Contains(s.Id));
                ViewBag.SelectedGroupId = groupId;
            }

            if (!string.IsNullOrEmpty(searchString))
            {
                string search = searchString.ToLower();
                query = query.Where(s => 
                    (s.Email != null && s.Email.ToLower().Contains(search)) || 
                    (s.FirstName != null && s.FirstName.ToLower().Contains(search)) || 
                    (s.LastName != null && s.LastName.ToLower().Contains(search))
                );
                ViewBag.SearchString = searchString;
            }

            if (startDate.HasValue) {
                query = query.Where(s => s.CreatedDate >= startDate.Value);
                ViewBag.StartDate = startDate.Value.ToString("yyyy-MM-dd");
            }
            if (endDate.HasValue) {
                var nextDay = endDate.Value.AddDays(1);
                query = query.Where(s => s.CreatedDate < nextDay);
                ViewBag.EndDate = endDate.Value.ToString("yyyy-MM-dd");
            }

            int pageSize = 20;
            int totalRecords = query.Count(); 
            int totalPages = (int)Math.Ceiling(totalRecords / (double)pageSize);
            page = page < 1 ? 1 : page;
            if (totalPages > 0 && page > totalPages) page = totalPages;

            var list = query.OrderByDescending(x => x.Id)
                            .Skip((page - 1) * pageSize)
                            .Take(pageSize)
                            .ToList();

            ViewBag.CurrentPage = page;
            ViewBag.TotalPages = totalPages;
            ViewBag.TotalRecords = totalRecords;
            
            return View(list);
        }
    }

    // Klasör Merkezi
    public IActionResult Groups(string? searchString, int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var query = db.SubscriberGroups.Where(g => g.UserId == currentUserId).AsQueryable();

            if (!string.IsNullOrEmpty(searchString))
            {
                query = query.Where(g => g.GroupName.Contains(searchString));
                ViewBag.SearchString = searchString;
            }

            int pageSize = 12; 
            int totalRecords = query.Count();
            int totalPages = (int)Math.Ceiling(totalRecords / (double)pageSize);
            page = page < 1 ? 1 : page;

            // "Tüm Aboneler" sistem klasörü her zaman en başta gösterilir (sayfalamadan bağımsız)
            var systemGroup = db.SubscriberGroups
                .FirstOrDefault(g => g.UserId == currentUserId && g.IsSystem);

            var list = query.Where(g => !g.IsSystem)
                            .OrderBy(g => g.GroupName)
                            .Skip((page - 1) * pageSize)
                            .Take(pageSize)
                            .ToList();

            if (systemGroup != null)
                list.Insert(0, systemGroup);

            var groupCounts = db.SubscriberGroupMembers
                                .Where(m => list.Select(l => l.Id).Contains(m.GroupId))
                                .GroupBy(m => m.GroupId)
                                .Select(g => new { GroupId = g.Key, Count = g.Count() })
                                .ToDictionary(x => x.GroupId, x => x.Count);

            if (systemGroup != null)
            {
                // Sistem klasörü için asıl abone sayısını kullan (aktif/pasif fark etmeksizin tümü)
                int totalCount = db.Subscribers.Count(s => s.UserId == currentUserId);
                groupCounts[systemGroup.Id] = totalCount;
            }

            ViewBag.GroupCounts = groupCounts;
            ViewBag.CurrentPage = page;
            ViewBag.TotalPages = totalPages;
            ViewBag.TotalRecords = totalRecords;

            return View(list);
        }
    }

    // Klasörün içindekilerini gösteren detay sayfası
    public IActionResult GroupDetails(int groupId, int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var group = db.SubscriberGroups.FirstOrDefault(g => g.Id == groupId && g.UserId == currentUserId);
            if (group == null) return RedirectToAction("Groups");

            int pageSize = 20;
            IQueryable<Subscriber> query;

            if (group.IsSystem)
            {
                // Sistem klasörü ise doğrudan tüm aboneleri göster (aktif/pasif fark etmeksizin)
                query = db.Subscribers.Where(s => s.UserId == currentUserId);
            }
            else
            {
                var memberIds = db.SubscriberGroupMembers.Where(m => m.GroupId == groupId).Select(m => m.SubscriberId).ToList();
                query = db.Subscribers.Where(s => memberIds.Contains(s.Id));
            }

            int totalRecords = query.Count();
            int totalPages = (int)Math.Ceiling(totalRecords / (double)pageSize);

            if (page > totalPages && totalPages > 0)
            {
                return RedirectToAction("GroupDetails", new { groupId = groupId, page = totalPages });
            }

            page = page < 1 ? 1 : page;

            var members = query.OrderByDescending(s => s.Id).Skip((page - 1) * pageSize).Take(pageSize).ToList();

            ViewBag.Group = group;
            ViewBag.CurrentPage = page;
            ViewBag.TotalPages = totalPages;
            ViewBag.TotalRecords = totalRecords;

            return View(members);
        }
    }

    // Klasöre abone ekleme sayfası (Seçim Ekranı)
    public IActionResult AddMembers(int groupId, string? searchString, int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var group = db.SubscriberGroups.FirstOrDefault(g => g.Id == groupId && g.UserId == currentUserId);
            if (group == null) return RedirectToAction("Groups");

            // Zaten bu klasörde olanları göstermeyelim
            var existingMemberIds = db.SubscriberGroupMembers.Where(m => m.GroupId == groupId).Select(m => m.SubscriberId).ToList();

            var query = db.Subscribers.Where(s => s.UserId == currentUserId && !existingMemberIds.Contains(s.Id)).AsQueryable();

            if (!string.IsNullOrEmpty(searchString))
            {
                string search = searchString.ToLower();
                query = query.Where(s => (s.Email != null && s.Email.ToLower().Contains(search)) || 
                                         (s.FirstName != null && s.FirstName.ToLower().Contains(search)) || 
                                         (s.LastName != null && s.LastName.ToLower().Contains(search)));
                ViewBag.SearchString = searchString;
            }

            int pageSize = 20;
            int totalRecords = query.Count();
            int totalPages = (int)Math.Ceiling(totalRecords / (double)pageSize);
            page = page < 1 ? 1 : page;

            var list = query.OrderByDescending(s => s.Id).Skip((page - 1) * pageSize).Take(pageSize).ToList();

            ViewBag.Group = group;
            ViewBag.CurrentPage = page;
            ViewBag.TotalPages = totalPages;
            ViewBag.TotalRecords = totalRecords;
            
            return View(list);
        }
    }

    // Seçilenleri kaydet
    [HttpPost]
    public IActionResult SaveMembersToGroup(int groupId, int[] subscriberIds)
    {
        if (subscriberIds == null || subscriberIds.Length == 0) return RedirectToAction("GroupDetails", new { groupId });

        using (var db = new MailMarketingContext())
        {
            foreach (var subId in subscriberIds)
            {
                if (!db.SubscriberGroupMembers.Any(m => m.GroupId == groupId && m.SubscriberId == subId))
                {
                    db.SubscriberGroupMembers.Add(new SubscriberGroupMember { GroupId = groupId, SubscriberId = subId });
                }
            }
            db.SaveChanges();
        }
        TempData["Message"] = "Seçilen aboneler klasöre başarıyla eklendi.";
        return RedirectToAction("GroupDetails", new { groupId });
    }

    // AJAX ile klasör arama (Sayfalandırmalı)
    [HttpGet]
    public IActionResult SearchGroupsAjax(string term = "", int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        int pageSize = 20;

        using (var db = new MailMarketingContext())
        {
            var query = db.SubscriberGroups.Where(g => g.UserId == currentUserId).AsQueryable();

            if (!string.IsNullOrEmpty(term))
            {
                query = query.Where(g => g.GroupName.Contains(term));
            }

            var totalCount = query.Count();
            var results = query.OrderBy(g => g.GroupName)
                               .Skip((page - 1) * pageSize)
                               .Take(pageSize)
                               .Select(g => new { g.Id, g.GroupName })
                               .ToList();

            return Json(new { totalCount, page, pageSize, data = results });
        }
    }

    // AJAX ile abone listeleme (Parametreli)
    [HttpGet]
    public IActionResult SearchSubscribersIndexAjax(string? searchString, DateTime? startDate, DateTime? endDate, int? groupId, string? status, int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        int pageSize = 20;

        using (var db = new MailMarketingContext())
        {
            var query = db.Subscribers.Where(s => s.UserId == currentUserId).AsQueryable();

            // Status Filter
            if (status == "active") query = query.Where(s => s.IsActive);
            else if (status == "passive") query = query.Where(s => !s.IsActive);

            // Group Filter
            if (groupId.HasValue && groupId.Value > 0)
            {
                var memberIds = db.SubscriberGroupMembers
                                  .Where(m => m.GroupId == groupId.Value)
                                  .Select(m => m.SubscriberId)
                                  .ToList();
                query = query.Where(s => memberIds.Contains(s.Id));
            }

            // Search Filter
            if (!string.IsNullOrEmpty(searchString))
            {
                string search = searchString.ToLower();
                query = query.Where(s => 
                    (s.Email != null && s.Email.ToLower().Contains(search)) || 
                    (s.FirstName != null && s.FirstName.ToLower().Contains(search)) || 
                    (s.LastName != null && s.LastName.ToLower().Contains(search))
                );
            }

            // Date Filters
            if (startDate.HasValue) query = query.Where(s => s.CreatedDate >= startDate.Value);
            if (endDate.HasValue) {
                var nextDay = endDate.Value.AddDays(1);
                query = query.Where(s => s.CreatedDate < nextDay);
            }

            var totalCount = query.Count();
            var results = query.OrderByDescending(x => x.Id)
                               .Skip((page - 1) * pageSize)
                               .Take(pageSize)
                               .Select(s => new { 
                                   s.Id, 
                                   s.FirstName, 
                                   s.LastName, 
                                   s.Email, 
                                   CreatedDate = s.CreatedDate.ToString("dd.MM.yyyy HH:mm"), 
                                   s.IsActive 
                               })
                               .ToList();

            return Json(new { totalCount, page, pageSize, data = results });
        }
    }

    // --- Klasör İşlemleri ---

    [HttpPost]
    public IActionResult CreateGroup(string groupName)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(groupName) || string.IsNullOrEmpty(sid)) return BadRequest();

        int currentUserId = int.Parse(sid);
        string trimmedName = groupName.Trim();

        using (var db = new MailMarketingContext())
        {
            // Sistem klasörünün ismiyle aynı adda klasör açılamaz
            if (trimmedName.ToLower() == "tüm aboneler")
            {
                TempData["Error"] = "'Tüm Aboneler' adı sistem tarafından ayrılmıştır, bu isimde klasör oluşturamazsınız.";
                return RedirectToAction("Groups");
            }

            bool exists = db.SubscriberGroups.Any(g => g.UserId == currentUserId && g.GroupName.ToLower() == trimmedName.ToLower());

            if (exists)
            {
                TempData["Error"] = $"'{trimmedName}' isimli bir klasörünüz zaten var!";
                return RedirectToAction("Groups");
            }

            var newGroup = new SubscriberGroup { GroupName = trimmedName, UserId = currentUserId, CreatedAt = DateTime.Now };
            db.SubscriberGroups.Add(newGroup);
            db.SaveChanges();
            
            LogManager.LogAction(currentUserId, "Klasör Oluşturuldu", $"'{trimmedName}' isimli yeni bir klasör oluşturuldu.");
            TempData["Message"] = "Klasör başarıyla oluşturuldu.";
        }
        return RedirectToAction("Groups");
    }

    [HttpPost]
    public IActionResult DeleteGroup(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var group = db.SubscriberGroups.FirstOrDefault(g => g.Id == id && g.UserId == currentUserId);
            if (group != null)
            {
                // Sistem klasörü silinemez
                if (group.IsSystem)
                {
                    TempData["Error"] = "'Tüm Aboneler' sistem klasörü silinemez!";
                    return RedirectToAction("Groups");
                }

                string oldName = group.GroupName;
                var links = db.SubscriberGroupMembers.Where(m => m.GroupId == id);
                db.SubscriberGroupMembers.RemoveRange(links);
                db.SubscriberGroups.Remove(group);
                db.SaveChanges();
                
                LogManager.LogAction(currentUserId, "Klasör Silindi", $"'{oldName}' isimli klasör ve tüm bağlantıları silindi.");
                TempData["Message"] = "Klasör silindi.";
            }
        }
        return RedirectToAction("Groups");
    }

    [HttpPost]
    public IActionResult BulkDeleteGroups(int[] groupIds)
    {
        if (groupIds == null || groupIds.Length == 0) return BadRequest();
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            // Sistem klasörlerini toplu silme listesinden çıkar
            var groupsToDelete = db.SubscriberGroups
                .Where(g => groupIds.Contains(g.Id) && g.UserId == currentUserId && !g.IsSystem)
                .ToList();
            int count = groupsToDelete.Count;
            foreach (var group in groupsToDelete)
            {
                var links = db.SubscriberGroupMembers.Where(m => m.GroupId == group.Id);
                db.SubscriberGroupMembers.RemoveRange(links);
                db.SubscriberGroups.Remove(group);
            }
            db.SaveChanges();
            
            LogManager.LogAction(currentUserId, "Toplu Klasör Silme", $"{count} adet klasör toplu olarak silindi.");
            TempData["Message"] = "Seçilen klasörler silindi.";
        }
        return Ok();
    }

    [HttpPost]
    public IActionResult RenameGroup(int id, string newName)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(newName) || id <= 0) return Json(new { success = false, message = "Geçersiz veri." });
        
        int currentUserId = int.Parse(sid!);
        string trimmedName = newName.Trim();

        using (var db = new MailMarketingContext())
        {
            var group = db.SubscriberGroups.FirstOrDefault(g => g.Id == id && g.UserId == currentUserId);
            if (group == null) return Json(new { success = false, message = "Klasör bulunamadı veya yetkiniz yok." });

            // Sistem klasörü yeniden adlandırılamaz
            if (group.IsSystem)
                return Json(new { success = false, message = "'Tüm Aboneler' sistem klasörü yeniden adlandırılamaz!" });

            // Aynı isimde başka klasör var mı kontrolü
            bool exists = db.SubscriberGroups.Any(g => g.UserId == currentUserId && g.Id != id && g.GroupName.ToLower() == trimmedName.ToLower());
            if (exists) return Json(new { success = false, message = "Bu isimde başka bir klasör zaten var." });

            string oldName = group.GroupName;
            group.GroupName = trimmedName;
            db.SaveChanges();

            LogManager.LogAction(currentUserId, "Klasör Yeniden Adlandırıldı", $"'{oldName}' klasörünün adı '{trimmedName}' olarak değiştirildi.");
        }

        return Json(new { success = true });
    }

    [HttpPost]
    public IActionResult AddToGroup(int subscriberId, int groupId)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var group = db.SubscriberGroups.FirstOrDefault(g => g.Id == groupId && g.UserId == currentUserId);
            var subscriber = db.Subscribers.FirstOrDefault(s => s.Id == subscriberId && s.UserId == currentUserId);

            if (group != null && subscriber != null)
            {
                var exists = db.SubscriberGroupMembers.Any(m => m.SubscriberId == subscriberId && m.GroupId == groupId);
                if (!exists) 
                {
                    db.SubscriberGroupMembers.Add(new SubscriberGroupMember { 
                        SubscriberId = subscriberId, 
                        GroupId = groupId
                    });
                    db.SaveChanges();
                    
                    LogManager.LogAction(currentUserId, "Klasöre Üye Eklendi", $"'{subscriber.Email}' adresi '{group.GroupName}' klasörüne eklendi.");
                    TempData["Message"] = "Abone klasöre eklendi.";
                }
                else
                {
                    TempData["Error"] = "Bu abone zaten o klasörde var.";
                }
                return RedirectToAction("Index");
            }
        }
        return BadRequest();
    }

    [HttpPost]
    public IActionResult BulkAddToGroup(int[] subscriberIds, int[] groupIds)
    {
        if (subscriberIds == null || !subscriberIds.Any() || groupIds == null || !groupIds.Any()) 
            return Json(new { success = false, message = "Lütfen abone ve en az bir klasör seçin." });

        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var validGroupIds = db.SubscriberGroups
                .Where(g => groupIds.Contains(g.Id) && g.UserId == currentUserId)
                .Select(g => g.Id)
                .ToList();

            if (!validGroupIds.Any()) return Json(new { success = false, message = "Geçersiz klasör seçimi." });

            var validSubscriberIds = db.Subscribers
                .Where(s => subscriberIds.Contains(s.Id) && s.UserId == currentUserId)
                .Select(s => s.Id)
                .ToList();

            int addedCount = 0;

            foreach (var subId in validSubscriberIds)
            {
                foreach (var grpId in validGroupIds)
                {
                    var exists = db.SubscriberGroupMembers.Any(m => m.SubscriberId == subId && m.GroupId == grpId);
                    if (!exists) 
                    {
                        db.SubscriberGroupMembers.Add(new SubscriberGroupMember { SubscriberId = subId, GroupId = grpId });
                        addedCount++;
                    }
                }
            }

            db.SaveChanges();
            
            LogManager.LogAction(currentUserId, "Klasörlere Ekleme", $"{validSubscriberIds.Count} abone, {validGroupIds.Count} farklı klasöre dağıtıldı.");
        }

        return Json(new { success = true, message = "İşlem tamamlandı." });
    }

    [HttpPost]
    public IActionResult RemoveFromGroup(int groupId, List<int> subscriberIds)
    {
        if (subscriberIds == null || !subscriberIds.Any() || groupId <= 0)
            return Json(new { success = false, message = "Geçersiz veri!" });

        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var group = db.SubscriberGroups.FirstOrDefault(g => g.Id == groupId && g.UserId == currentUserId);
            if (group == null) return Json(new { success = false, message = "Yetkisiz işlem!" });

            // Sistem klasöründen abone çıkarılamaz
            if (group.IsSystem)
                return Json(new { success = false, message = "'Tüm Aboneler' sistem klasöründen abone çıkarılamaz!" });

            var relations = db.SubscriberGroupMembers
                .Where(m => m.GroupId == groupId && subscriberIds.Contains(m.SubscriberId))
                .ToList();

            if (relations.Any())
            {
                db.SubscriberGroupMembers.RemoveRange(relations);
                db.SaveChanges();
                
                LogManager.LogAction(currentUserId, "Klasörden Çıkarıldı", $"{relations.Count} abone '{group.GroupName}' klasöründen çıkarıldı.");
            }
        }

        return Json(new { success = true });
    }

    [HttpPost]
    public IActionResult RemoveFromAllGroups(List<int> subscriberIds)
    {
        if (subscriberIds == null || !subscriberIds.Any())
            return Json(new { success = false, message = "Seçim yapılmadı!" });

        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var userGroupIds = db.SubscriberGroups
                                 .Where(g => g.UserId == currentUserId)
                                 .Select(g => g.Id)
                                 .ToList();

            if (!userGroupIds.Any())
                return Json(new { success = true, message = "Zaten hiç klasörünüz yok." });

            var relations = db.SubscriberGroupMembers
                .Where(m => userGroupIds.Contains(m.GroupId) && subscriberIds.Contains(m.SubscriberId))
                .ToList();

            if (relations.Any())
            {
                db.SubscriberGroupMembers.RemoveRange(relations);
                db.SaveChanges();
                
                LogManager.LogAction(currentUserId, "Klasör Bağları Temizlendi", $"{relations.Count} adet klasör bağlantısı temizlendi.");
            }
        }

        return Json(new { success = true });
    }

    [HttpGet]
    public IActionResult GetGroupMembers(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext()) {
            var group = db.SubscriberGroups.FirstOrDefault(g => g.Id == id && g.UserId == currentUserId);
            if (group == null) return BadRequest();

            var memberIds = db.SubscriberGroupMembers.Where(m => m.GroupId == id).Select(m => m.SubscriberId).ToList();
            return Json(memberIds);
        }
    }

    // --- Temel Abone İşlemleri ---

    [HttpGet]
    public IActionResult Create() => View();

    [HttpPost]
    public IActionResult Create(Subscriber subscriber)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        subscriber.UserId = currentUserId;
        subscriber.CreatedDate = DateTime.Now;
        if (_subscriberManager.Add(subscriber) == "OK") {
            LogManager.LogAction(currentUserId, "Abone Oluşturuldu", $"'{subscriber.Email}' adresi manuel olarak sisteme eklendi.");
            TempData["Message"] = "Abone oluşturuldu.";
            return RedirectToAction("Index");
        }
        return View(subscriber);
    }

    [HttpGet]
    public IActionResult Edit(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var sub = _subscriberManager.GetById(id);
        if (sub == null || sub.UserId != int.Parse(sid!)) return RedirectToAction("Index");
        return View(sub);
    }

    [HttpPost]
    public IActionResult Edit(Subscriber subscriber)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        subscriber.UserId = currentUserId;
        if (_subscriberManager.Update(subscriber) == "OK") {
            LogManager.LogAction(currentUserId, "Abone Düzenlendi", $"'{subscriber.Email}' abonesinin bilgileri güncellendi.");
            TempData["Message"] = "Abone güncellendi.";
            return RedirectToAction("Index");
        }
        return View(subscriber);
    }

    public IActionResult ToggleStatus(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var sub = db.Subscribers.FirstOrDefault(s => s.Id == id && s.UserId == currentUserId);
            if (sub != null)
            {
                sub.IsActive = !sub.IsActive; 
                db.SaveChanges();
                
                string durum = sub.IsActive ? "aktife" : "pasife";
                LogManager.LogAction(currentUserId, "Abone Durumu Değişti", $"{sub.Email} adresi {durum} alındı.");
                TempData["Message"] = "Abone durumu güncellendi.";
            }
        }
        return RedirectToAction("Index");
    }

    [HttpPost]
    public IActionResult Delete(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var sub = db.Subscribers.FirstOrDefault(s => s.Id == id && s.UserId == currentUserId);
            if (sub != null) 
            {
                bool hasMailSent = db.MailLogs.Any(m => m.SubscriberId == id);
                
                if (hasMailSent)
                {
                    TempData["Error"] = "Bu aboneye daha önce mail gönderildiği için silinemez!";
                    return RedirectToAction("Index");
                }

                string deletedEmail = sub.Email ?? "Bilinmeyen";
                var links = db.SubscriberGroupMembers.Where(m => m.SubscriberId == id);
                db.SubscriberGroupMembers.RemoveRange(links);
                db.SaveChanges();
                _subscriberManager.Delete(id);
                
                LogManager.LogAction(currentUserId, "Abone Silindi", $"{deletedEmail} e-posta adresi sistemden silindi.");
                TempData["Message"] = "Abone başarıyla silindi.";
            }
        }
        return RedirectToAction("Index");
    }

    // --- Toplu İşlemler ---

    [HttpGet]
    public IActionResult Import() => View();

    [HttpPost]
    public async Task<IActionResult> Import(IFormFile file)
    {
        if (file == null || file.Length == 0) return View();
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        int addedCount = 0;

        using (var stream = new MemoryStream()) {
            await file.CopyToAsync(stream);
            using (var package = new ExcelPackage(stream)) {
                var worksheet = package.Workbook.Worksheets.FirstOrDefault();
                if (worksheet == null) return View();
                using (var db = new MailMarketingContext()) {
                    // Sistem klasörünü bir kez bul
                    var systemGroup = db.SubscriberGroups
                        .FirstOrDefault(g => g.UserId == currentUserId && g.IsSystem);

                    for (int row = 2; row <= worksheet.Dimension.Rows; row++) {
                        var email = worksheet.Cells[row, 1].Text?.Trim();
                        if (string.IsNullOrEmpty(email) || db.Subscribers.Any(s => s.Email == email && s.UserId == currentUserId)) continue;
                        
                        var newSub = new Subscriber { 
                            Email = email, 
                            FirstName = worksheet.Cells[row, 2].Text, 
                            LastName = worksheet.Cells[row, 3].Text, 
                            CreatedDate = DateTime.Now, 
                            IsActive = true, 
                            UserId = currentUserId 
                        };
                        db.Subscribers.Add(newSub);
                        db.SaveChanges(); // Id alması için hemen kaydet

                        // Sistem klasörüne de ekle
                        if (systemGroup != null)
                        {
                            db.SubscriberGroupMembers.Add(new SubscriberGroupMember { 
                                GroupId = systemGroup.Id, 
                                SubscriberId = newSub.Id 
                            });
                            db.SaveChanges();
                        }

                        addedCount++;
                    }
                    
                    LogManager.LogAction(currentUserId, "Excel Aktarımı", $"Excel üzerinden {addedCount} yeni abone yüklendi.");
                    TempData["Message"] = "Excel aktarımı tamamlandı.";
                }
            }
        }
        return RedirectToAction("Index");
    }

    [HttpPost]
    public IActionResult BulkDelete(int[] selectedIds)
    {
        if (selectedIds == null || selectedIds.Length == 0) return RedirectToAction("Index");
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        int skipped = 0;
        int deleted = 0;

        using (var db = new MailMarketingContext()) {
            var subs = db.Subscribers.Where(s => selectedIds.Contains(s.Id) && s.UserId == currentUserId).ToList();
            foreach (var sub in subs) {
                if (db.MailLogs.Any(m => m.SubscriberId == sub.Id)) {
                    skipped++;
                    continue;
                }
                var links = db.SubscriberGroupMembers.Where(m => m.SubscriberId == sub.Id);
                db.SubscriberGroupMembers.RemoveRange(links);
                db.Subscribers.Remove(sub);
                deleted++;
            }
            db.SaveChanges();
            
            LogManager.LogAction(currentUserId, "Toplu Abone Silme", $"{deleted} adet abone silindi, {skipped} adet abone gönderim kaydı olduğu için atlandı.");
        }

        if (skipped > 0) TempData["Error"] = $"{deleted} kişi silindi, {skipped} kişi gönderim kaydı olduğu için atlandı!";
        else TempData["Message"] = "Seçilen aboneler silindi.";

        return RedirectToAction("Index");
    }

    [HttpPost]
    public IActionResult BulkActivate(int[] selectedIds)
    {
        if (selectedIds == null || selectedIds.Length == 0) return RedirectToAction("Index");
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext()) {
            var subs = db.Subscribers.Where(s => selectedIds.Contains(s.Id) && s.UserId == currentUserId).ToList();
            foreach (var sub in subs) sub.IsActive = true;
            db.SaveChanges();
            
            LogManager.LogAction(currentUserId, "Toplu Abone Aktivasyonu", $"{subs.Count} adet abone aktife çekildi.");
            TempData["Message"] = $"{subs.Count} abone başarıyla aktifleştirildi.";
        }
        return RedirectToAction("Index");
    }

    [HttpPost]
    public IActionResult BulkDeactivate(int[] selectedIds)
    {
        if (selectedIds == null || selectedIds.Length == 0) return RedirectToAction("Index");
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext()) {
            var subs = db.Subscribers.Where(s => selectedIds.Contains(s.Id) && s.UserId == currentUserId).ToList();
            foreach (var sub in subs) sub.IsActive = false;
            db.SaveChanges();
            
            LogManager.LogAction(currentUserId, "Toplu Abone Deaktivasyonu", $"{subs.Count} adet abone pasife çekildi.");
            TempData["Message"] = $"{subs.Count} abone pasife alındı.";
        }
        return RedirectToAction("Index");
    }
}