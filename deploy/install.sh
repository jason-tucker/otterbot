#!/bin/bash
set -e

echo "Installing Otterbot systemd service..."

sudo cp systemd/otterbot.service /etc/systemd/system/
sudo cp systemd/otterbot-restart.service /etc/systemd/system/
sudo cp systemd/otterbot-restart.timer /etc/systemd/system/

sudo systemctl daemon-reload

sudo systemctl enable otterbot.service
sudo systemctl enable otterbot-restart.timer

sudo systemctl start otterbot.service
sudo systemctl start otterbot-restart.timer

echo ""
echo "Done! Otterbot is running and will start on boot."
echo "Weekly restart scheduled for Tuesday at 4AM."
echo ""
echo "Useful commands:"
echo "  sudo systemctl status otterbot"
echo "  sudo journalctl -u otterbot -f"
echo "  sudo systemctl restart otterbot"
