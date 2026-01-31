
from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Capture console logs
        console_logs = []
        page.on("console", lambda msg: console_logs.append(msg.text))

        try:
            print("Navigating to game...")
            page.goto("http://localhost:8080/index.html")

            # Wait for the start screen
            print("Waiting for start screen...")
            page.wait_for_selector("#start-screen", state="visible")

            # Check if buttons are clickable
            print("Checking buttons...")
            # Click MINI class
            page.click("#class-mini")

            # Check if class changed (we can't easily check internal state, but we can check if the UI updated)
            # The 'selected' class should move to the Mini button
            is_mini_selected = page.evaluate("document.getElementById('class-mini').classList.contains('selected')")
            if not is_mini_selected:
                print("ERROR: Mini button did not get 'selected' class after click!")
                # If script wasn't running, this would happen (onclick wouldn't fire or do anything)
            else:
                print("SUCCESS: Mini button selected.")

            # Click Enter Cockpit
            print("Clicking Start...")
            page.click("#start-btn")

            # Wait for game to load (canvas visible, start screen hidden)
            print("Waiting for game load...")
            page.wait_for_selector("canvas", state="visible", timeout=10000)

            # Take a screenshot
            page.screenshot(path="/home/jules/verification/fixed_gameplay.png")
            print("Screenshot saved to fixed_gameplay.png")

        except Exception as e:
            print(f"Verification failed: {e}")
        finally:
            print("Console Logs:")
            for log in console_logs:
                print(f"  {log}")
            browser.close()

if __name__ == "__main__":
    run()
