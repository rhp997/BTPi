#!/bin/sh
# Sourced from /etc/profile.d/notice.sh (login shells) and /etc/bash.bashrc
# (non-login interactive shells) so it fires on every attach, however it
# happens. Guarded to interactive shells only so non-interactive sessions
# (e.g. Ansible) never see it mixed into their output.
case "$-" in
  *i*)
    cat <<'EOF'

################################################################
### NOTICE: This shell is running inside a container and    ###
###         NOT on a Raspberry Pi device.                    ###
################################################################

EOF
    ;;
esac
