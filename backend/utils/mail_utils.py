import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any
from config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, DEFAULT_FROM_EMAIL

def _send_sync_email(to_email: str, subject: str, html_content: str):
    """Synchronous email sending logic."""
    if not SMTP_USER or not SMTP_PASSWORD:
        print("⚠️ SMTP credentials not configured. Skipping email sending.")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = DEFAULT_FROM_EMAIL or SMTP_USER
        msg["To"] = to_email

        # Create HTML part
        part = MIMEText(html_content, "html")
        msg.attach(part)

        # Connect and send
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()  # Upgrade to TLS
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        
        print(f"✅ Order confirmation email sent to {to_email}")
        return True
    except Exception as e:
        print(f"❌ Failed to send email: {e}")
        return False

async def send_order_confirmation_email(order_data: Dict[str, Any]):
    """
    Sends an order confirmation email to the customer.
    
    Args:
        order_data: Dictionary containing order details (id, items, total, address, etc.)
    """
    customer_email = order_data.get("delivery_address") # Using address as placeholder for email if not found
    # In a real app, we'd fetch the customer's email from the DB.
    # For now, let's try to extract something that looks like an email or use a default.
    
    # If delivery_address contains an @, use it. Otherwise, use SMTP_USER as test recipient.
    recipient = SMTP_USER
    if customer_email and "@" in customer_email:
        recipient = customer_email
    
    order_id = order_data.get("order_id", "N/A")
    items = order_data.get("items", [])
    total = order_data.get("total", 0)
    address = order_data.get("delivery_address", "N/A")
    estimated_delivery = order_data.get("estimated_delivery", "N/A")

    subject = f"Order Confirmation - Mediloon #{order_id}"
    
    items_html = "".join([
        f"<tr><td>{item.get('brand_name')}</td><td>{item.get('quantity')}</td><td>€{item.get('price', 0):.2f}</td></tr>"
        for item in items
    ])

    html_content = f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ width: 80%; margin: 20px auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px; }}
            .header {{ background: #4a90e2; color: white; padding: 10px; text-align: center; border-radius: 8px 8px 0 0; }}
            .footer {{ margin-top: 20px; font-size: 0.8em; color: #777; text-align: center; }}
            table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
            th, td {{ padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }}
            th {{ background-color: #f8f8f8; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Mediloon Pharamcy</h1>
                <h2>Order Confirmation</h2>
            </div>
            <p>Thank you for choosing Mediloon! Your order has been successfully placed.</p>
            <h3>Order Details:</h3>
            <p><strong>Order ID:</strong> #{order_id}</p>
            <p><strong>Estimated Delivery:</strong> {estimated_delivery}</p>
            <p><strong>Delivery Address:</strong> {address}</p>
            
            <table>
                <thead>
                    <tr>
                        <th>Medicine</th>
                        <th>Qty</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody>
                    {items_html}
                </tbody>
            </table>
            
            <p><strong>Total: €{total:.2f} (Cash on Delivery)</strong></p>
            
            <p>If you have any questions, please contact our support team.</p>
            
            <div class="footer">
                &copy; 2026 Mediloon AI Pharmacy. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    """

    # Run synchronous SMTP call in a separate thread to avoid blocking the event loop
    return await asyncio.to_thread(_send_sync_email, recipient, subject, html_content)
