using Application.Interface;
using Application.DTOs;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;

namespace Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class NotificationsController : ControllerBase
    {
        private readonly INotificationService _svc;

        public NotificationsController(INotificationService svc)
        {
            _svc = svc;
        }

        // -----------------------------------------------------
        // SEND NOTIFICATION (ADMIN / SYSTEM)
        // -----------------------------------------------------
        [HttpPost("send")]
        public async Task<IActionResult> Send([FromBody] NotificationCreateRequest req)
        {
            if (req == null)
                return BadRequest(new { message = "Request body is missing." });

            try
            {
                var created = await _svc.CreateForUsersAsync(req);

                return Ok(new
                {
                    message = "Notification sent successfully.",
                    data = created
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    message = "Failed to send notification.",
                    error = ex.Message
                });
            }
        }

        // -----------------------------------------------------
        // MARK SINGLE NOTIFICATION AS READ
        // -----------------------------------------------------
        [HttpPost("read/{recipientId:guid}")]
        public async Task<IActionResult> MarkAsRead(Guid recipientId)
        {
            var userId = User?.FindFirst("UserId")?.Value;

            if (string.IsNullOrEmpty(userId))
                return Unauthorized(new { message = "User not authenticated." });

            try
            {
                var updated = await _svc.MarkAsReadAsync(recipientId, userId);

                if (!updated)
                    return NotFound(new
                    {
                        message = "Notification not found or access denied."
                    });

                return Ok(new { message = "Notification marked as read." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    message = "Failed to update notification.",
                    error = ex.Message
                });
            }
        }

        // -----------------------------------------------------
        // ACKNOWLEDGE NOTIFICATION
        // -----------------------------------------------------
        [HttpPost("ack/{recipientId:guid}")]
        public async Task<IActionResult> Acknowledge(Guid recipientId)
        {
            var userId = User?.FindFirst("UserId")?.Value;

            if (string.IsNullOrEmpty(userId))
                return Unauthorized(new { message = "User not authenticated." });

            try
            {
                var updated = await _svc.AcknowledgeAsync(recipientId, userId);

                if (!updated)
                    return NotFound(new
                    {
                        message = "Notification not found or access denied."
                    });

                return Ok(new { message = "Notification acknowledged." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    message = "Failed to acknowledge notification.",
                    error = ex.Message
                });
            }
        }

        // -----------------------------------------------------
        // GET ALL NOTIFICATIONS (ADMIN)
        // -----------------------------------------------------
        [HttpGet("all")]
        public async Task<IActionResult> GetAll(
     [FromQuery] DateTime? cursor = null,
     [FromQuery] int limit = 10
 )
        {
            try
            {
                var result = await _svc.GetAllNotificationsCursorAsync(cursor, limit);

                return Ok(new
                {
                    data = result.Items,
                    nextCursor = result.NextCursor,
                    hasMore = result.HasMore
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    message = "Failed to fetch notifications.",
                    error = ex.Message
                });
            }
        }


        // -----------------------------------------------------
        // GET MY NOTIFICATIONS (CURSOR PAGINATION)
        // -----------------------------------------------------
        [HttpGet("my")]
        public async Task<IActionResult> GetMy(
            [FromQuery] bool unread = false,
            [FromQuery] DateTime? cursor = null,
            [FromQuery] int limit = 10
        )
        {
            var userId = User?.FindFirst("UserId")?.Value;

            if (string.IsNullOrEmpty(userId))
                return Unauthorized(new { message = "User not authenticated." });

            try
            {
                var result = await _svc.GetForUserCursorAsync(
                    userId,
                    unread,
                    cursor,
                    limit
                );

                return Ok(new
                {
                    data = result.Items,
                    nextCursor = result.NextCursor,
                    hasMore = result.HasMore
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    message = "Failed to fetch user notifications.",
                    error = ex.Message
                });
            }
        }

        // -----------------------------------------------------
        // MARK ALL NOTIFICATIONS AS READ
        // -----------------------------------------------------
        [HttpPost("readall")]
        public async Task<IActionResult> MarkAllAsRead()
        {
            var userId = User?.FindFirst("UserId")?.Value;

            if (string.IsNullOrEmpty(userId))
                return Unauthorized(new { message = "User not authenticated." });

            try
            {
                var updated = await _svc.MarkAllAsReadAsync(userId);

                return Ok(new
                {
                    message = updated
                        ? "All notifications marked as read."
                        : "No unread notifications found."
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    message = "Failed to mark all notifications as read.",
                    error = ex.Message
                });
            }
        }

    }
}
