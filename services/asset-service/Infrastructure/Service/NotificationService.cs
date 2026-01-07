using Application.Interface;
using Application.DTOs;
using Domain.Entities;
using Infrastructure.DBs;
using Infrastructure.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Infrastructure.Service
{
    public class NotificationService : INotificationService
    {
        private readonly DBContext _db;
        private readonly UserAuthDbContext _userDb;
        private readonly IHubContext<NotificationHub> _hub;
        private readonly IEmailService _emailService;

        public NotificationService(
            DBContext db,
            IHubContext<NotificationHub> hub,
            UserAuthDbContext userDb,
            IEmailService emailService
            )
        {
            _db = db;
            _hub = hub;
            _userDb = userDb;
            _emailService = emailService;
        }


 public async Task<CursorResult<NotificationDto>> GetAllNotificationsCursorAsync(
    DateTime? cursor,
    int limit)
        {
            var query = _db.Notifications.AsNoTracking();

            if (cursor.HasValue)
                query = query.Where(n => n.CreatedAt < cursor.Value);

            var items = await query
                .OrderByDescending(n => n.CreatedAt)
                .Take(limit + 1)
                .Select(n => new NotificationDto(
                    n.Id,
                    n.Title,
                    n.Text,
                    n.CreatedAt,
                    n.ExpiresAt,
                    n.Priority
                ))
                .ToListAsync();

            var hasMore = items.Count > limit;

            if (hasMore)
                items.RemoveAt(items.Count - 1);

            return new CursorResult<NotificationDto>
            {
                Items = items,
                HasMore = hasMore,
                NextCursor = items.LastOrDefault()?.CreatedAt
            };
        }


        // -----------------------------------------------------
        // CREATE NOTIFICATION FOR ALL USERS
        // -----------------------------------------------------
        public async Task<NotificationDto> CreateForUsersAsync(NotificationCreateRequest req)
        {
            var now = DateTime.UtcNow;

            var notification = new Notification
            {
                Title = req.Title,
                Text = req.Text,
                CreatedAt = now,
                ExpiresAt = req.ExpiresAt ?? now.AddDays(30),
                Priority = req.Priority
            };

            _db.Notifications.Add(notification);
            await _db.SaveChangesAsync();

            var users = await _userDb.Users
    .Select(u => new
    {
        UserId = u.Id.ToString(),
        Email = u.Email
    })
    .ToListAsync();


           foreach (var user in users)
{
    _db.NotificationRecipients.Add(new NotificationRecipient
    {
        NotificationId = notification.Id,
        UserId = user.UserId
    });

    // 🔔 SignalR (existing behavior)
    await _hub.Clients.User(user.UserId).SendAsync(
        "ReceiveNotification",
        new NotificationDto(
            notification.Id,
            notification.Title,
            notification.Text,
            notification.CreatedAt,
            notification.ExpiresAt,
            notification.Priority
        )
    );

    // 📧 EMAIL (NEW)
    if (!string.IsNullOrWhiteSpace(user.Email))
    {
        try
        {
            await _emailService.SendEmailAsync(
                user.Email,
                notification.Title,
                BuildEmailHtml(notification)
            );
        }
        catch (Exception ex)
        {
            // Log the error (consider using a logging framework)
            Console.WriteLine($"Failed to send email to {user.Email}: {ex.Message}");
        }
    }
}


            await _db.SaveChangesAsync();

            return new NotificationDto(
                notification.Id,
                notification.Title,
                notification.Text,
                notification.CreatedAt,
                notification.ExpiresAt,
                notification.Priority
            );
        }

        // -----------------------------------------------------
        // GET USER NOTIFICATIONS (CURSOR PAGINATION)
        // -----------------------------------------------------
        public async Task<CursorResult<NotificationRecipientDto>> GetForUserCursorAsync(
            string userId,
            bool unreadOnly,
            DateTime? cursor,
            int limit)
        {
            var query = _db.NotificationRecipients
                .Include(r => r.Notification)
                .Where(r => r.UserId == userId);

            if (unreadOnly)
                query = query.Where(r => !r.IsRead);

            if (cursor.HasValue)
                query = query.Where(r => r.CreatedAt < cursor.Value);

            var items = await query
                .OrderByDescending(r => r.CreatedAt)
                .Take(limit + 1)
                .ToListAsync();

            var hasMore = items.Count > limit;

            if (hasMore)
                items.RemoveAt(items.Count - 1);

            return new CursorResult<NotificationRecipientDto>
            {
                Items = items.Select(r => MapRecipientDto(r)).ToList(),
                HasMore = hasMore,
                NextCursor = items.LastOrDefault()?.CreatedAt
            };
        }

        // -----------------------------------------------------
        // SIMPLE USER FETCH (OPTIONAL / NON-PAGINATED)
        // -----------------------------------------------------
        public async Task<List<NotificationRecipientDto>> GetForUserAsync(string userId, bool unreadOnly)
        {
            var query = _db.NotificationRecipients
                .Include(r => r.Notification)
                .Where(r => r.UserId == userId);

            if (unreadOnly)
                query = query.Where(r => !r.IsRead);

            var list = await query
                .OrderByDescending(r => r.CreatedAt)
                .ToListAsync();

            return list.Select(MapRecipientDto).ToList();
        }

        // -----------------------------------------------------
        // MARK AS READ
        // -----------------------------------------------------
        public async Task<bool> MarkAsReadAsync(Guid recipientId, string userId)
        {
            var rec = await _db.NotificationRecipients
                .FirstOrDefaultAsync(r => r.Id == recipientId && r.UserId == userId);

            if (rec == null) return false;

            if (!rec.IsRead)
            {
                rec.IsRead = true;
                rec.ReadAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }

            await _hub.Clients.User(userId)
                .SendAsync("NotificationMarkedRead", recipientId);

            return true;
        }

        // -----------------------------------------------------
        // ACKNOWLEDGE
        // -----------------------------------------------------
        public async Task<bool> AcknowledgeAsync(Guid recipientId, string userId)
        {
            var rec = await _db.NotificationRecipients
                .FirstOrDefaultAsync(r => r.Id == recipientId && r.UserId == userId);

            if (rec == null) return false;

            if (!rec.IsAcknowledged)
            {
                rec.IsAcknowledged = true;
                rec.AcknowledgedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }

            await _hub.Clients.User(userId)
                .SendAsync("NotificationAcknowledged", recipientId);

            return true;
        }

        // -----------------------------------------------------
        // GET ALL NOTIFICATIONS (ADMIN)
        // -----------------------------------------------------
        //public async Task<List<NotificationDto>> GetAllNotificationsAsync()
        //{
        //    return await _db.Notifications
        //        .AsNoTracking()
        //        .OrderByDescending(n => n.CreatedAt)
        //        .Select(n => new NotificationDto(
        //            n.Id,
        //            n.Title,
        //            n.Text,
        //            n.CreatedAt,
        //            n.ExpiresAt,
        //            n.Priority
        //        ))
        //        .ToListAsync();
        //}

        // -----------------------------------------------------
        // MARK ALL AS READ
        // -----------------------------------------------------
        public async Task<bool> MarkAllAsReadAsync(string userId)
        {
            var recs = await _db.NotificationRecipients
                .Where(r => r.UserId == userId && !r.IsRead)
                .ToListAsync();

            if (!recs.Any())
                return false;

            foreach (var r in recs)
            {
                r.IsRead = true;
                r.ReadAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync();

            foreach (var r in recs)
            {
                await _hub.Clients.User(userId)
                    .SendAsync("NotificationMarkedRead", r.Id);
            }

            return true;
        }

        // -----------------------------------------------------
        // PRIVATE MAPPER (CLEAN CODE)
        // -----------------------------------------------------
        private static NotificationRecipientDto MapRecipientDto(NotificationRecipient r)
        {
            return new NotificationRecipientDto
            {
                RecipientId = r.Id,
                NotificationId = r.NotificationId,
                Title = r.Notification.Title,
                Text = r.Notification.Text,
                IsRead = r.IsRead,
                IsAcknowledged = r.IsAcknowledged,
                CreatedAt = r.CreatedAt,
                ReadAt = r.ReadAt,
                AcknowledgedAt = r.AcknowledgedAt
            };
        }

private static string BuildEmailHtml(Notification n)
{
    return $@"
<!DOCTYPE html>
<html lang='en'>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>{n.Title}</title>
</head>
<body style='margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,""Segoe UI"",Roboto,""Helvetica Neue"",Arial,sans-serif;'>
    <table role='presentation' style='width:100%;border-collapse:collapse;'>
        <tr>
            <td align='center' style='padding:40px 0;'>
                <table role='presentation' style='width:100%;max-width:600px;border-collapse:collapse;background:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);'>
                    
                    <!-- Header -->
                    <tr>
                        <td style='padding:32px 32px 24px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:8px 8px 0 0;'>
                            <h1 style='margin:0;color:#ffffff;font-size:24px;font-weight:600;line-height:1.3;'>
                                ⚠️ Threshold Alert
                            </h1>
                        </td>
                    </tr>

                    <!-- Alert Title -->
                    <tr>
                        <td style='padding:32px 32px 0;'>
                            <div style='background:#fff3cd;border-left:4px solid #ffc107;padding:16px;border-radius:4px;margin-bottom:24px;'>
                                <h2 style='margin:0;color:#856404;font-size:18px;font-weight:600;'>
                                    {n.Title}
                                </h2>
                            </div>
                        </td>
                    </tr>

                    <!-- Alert Content -->
                    <tr>
                        <td style='padding:0 32px 32px;'>
                            <div style='background:#f8f9fa;border:1px solid #e9ecef;border-radius:6px;padding:20px;'>
                                <p style='margin:0;color:#212529;font-size:14px;line-height:1.6;white-space:pre-wrap;font-family:""Courier New"",Courier,monospace;'>
{n.Text}
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Timestamp (optional - add if you have it) -->
                    <tr>
                        <td style='padding:0 32px 24px;'>
                            <table role='presentation' style='width:100%;border-collapse:collapse;'>
                                <tr>
                                    <td style='padding:12px;background:#f8f9fa;border-radius:4px;'>
                                        <p style='margin:0;color:#6c757d;font-size:13px;'>
                                            <strong>Alert Time:</strong> {DateTime.Now:yyyy-MM-dd HH:mm:ss}
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Call to Action (optional) -->
                    <tr>
                        <td style='padding:0 32px 32px;' align='center'>
                            <a href='#' style='display:inline-block;padding:12px 32px;background:#667eea;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;'>
                                View Dashboard
                            </a>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style='padding:24px 32px;background:#f8f9fa;border-radius:0 0 8px 8px;border-top:1px solid #e9ecef;'>
                            <p style='margin:0 0 8px;color:#6c757d;font-size:12px;line-height:1.5;text-align:center;'>
                                <strong>WMind Industry 4.0</strong> – Automated Alert System
                            </p>
                            <p style='margin:0;color:#adb5bd;font-size:11px;text-align:center;'>
                                This is an automated notification. Please do not reply to this email.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
";
}



    }
}



