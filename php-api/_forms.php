<?php
/**
 * Every form that posts to /api/contact - same definitions as
 * api/_lib/forms.js. The browser sends { form: "<key>", fields: {...} };
 * the key decides the email subject and which fields are accepted.
 */

declare(strict_types=1);

const BUDGET_OPTIONS = [
    'under-5k' => 'Less than $5,000 / mo',
    '5k-20k' => '$5,000 - $20,000 / mo',
    '20k-100k' => '$20,000 - $100,000 / mo',
    'over-100k' => 'More than $100,000 / mo',
];

function forms(): array
{
    return [
        // start-a-growth-audit.html
        'growth-audit' => [
            'subject' => 'New enquiry: Start a Growth Audit page',
            'fields' => [
                'name' => ['label' => 'Name', 'type' => 'name', 'required' => true],
                'email' => ['label' => 'Email', 'type' => 'email', 'required' => true],
                'phone' => ['label' => 'Phone', 'type' => 'phone', 'required' => true],
                'company' => ['label' => 'Company', 'type' => 'text', 'required' => true],
                'message' => ['label' => 'Message', 'type' => 'longText', 'required' => true],
            ],
        ],
        // landing-1.html
        'landing-1' => [
            'subject' => 'New Growth Audit request: Landing page 1',
            'fields' => [
                'name' => ['label' => 'Name', 'type' => 'name', 'required' => true],
                'email' => ['label' => 'Email', 'type' => 'email', 'required' => true],
                'phone' => ['label' => 'Phone', 'type' => 'phone', 'required' => true],
                'website' => ['label' => 'Website', 'type' => 'url', 'required' => true],
                'budget' => ['label' => 'Monthly budget', 'type' => 'choice', 'required' => true, 'options' => BUDGET_OPTIONS],
            ],
        ],
        // landing-2.html
        'landing-2' => [
            'subject' => 'New Growth Audit request: Landing page 2',
            'fields' => [
                'name' => ['label' => 'Name', 'type' => 'name', 'required' => true],
                'email' => ['label' => 'Email', 'type' => 'email', 'required' => true],
                'website' => ['label' => 'Website', 'type' => 'url', 'required' => true],
            ],
        ],
    ];
}

function get_form(mixed $key): ?array
{
    return is_string($key) ? (forms()[$key] ?? null) : null;
}
