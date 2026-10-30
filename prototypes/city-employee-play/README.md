# Isolated city employee-ID play login

The project owner explicitly requested employee-number-only access from any device to the existing game role. Knowing an employee number is sufficient for this game entry. It is not verified employment and never authorizes business access.

This opt-in local add-on wraps the existing game server, creates separate city_play_links and city_play_sessions tables, and tags every ID-only session. Such sessions cannot export recovery cards, create durable recovery proof, issue or redeem formal handoffs, or access formal employee/data routes. Only existing guest roles can be linked. Mappings are unique and cannot overwrite an existing mapping or formal owner.

The UI uses play-login for a linked role and play-link plus the original city session and CSRF for first setup. Existing recovery cards remain a backup. No new role, wallet reset or coin grant occurs. integration.patch records the narrow changes to the existing isolated game client and employee adapter.

Validation uses the existing city runtime and temporary databases. Publishing these sources is not deployment of formal authentication. The preview expires at 2026-10-31 23:59 Asia/Taipei.
