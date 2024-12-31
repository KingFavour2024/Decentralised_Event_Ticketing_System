;; Decentralized Event Ticketing System
;; Description: Smart contract for managing event tickets, sales, and revenue distribution

;; Error Codes
(define-constant ERR-NOT-AUTHORIZED (err u1))
(define-constant ERR-EVENT-NOT-FOUND (err u2))
(define-constant ERR-SOLD-OUT (err u3))
(define-constant ERR-TICKET-NOT-FOUND (err u4))
(define-constant ERR-INVALID-PRICE (err u5))
(define-constant ERR-EVENT-EXPIRED (err u6))
(define-constant ERR-INSUFFICIENT-FUNDS (err u7))
(define-constant ERR-ALREADY-EXISTS (err u8))
(define-constant ERR-TRANSFER-NOT-ALLOWED (err u9))
(define-constant ERR-TICKET-USED (err u10))
(define-constant ERR-REFUND-WINDOW-CLOSED (err u11))


;; Data Maps
(define-map Events
    { event-id: uint }
    {
        name: (string-utf8 100),
        description: (string-utf8 500),
        organizer: principal,
        venue: (string-utf8 100),
        date: uint,
        total-tickets: uint,
        tickets-sold: uint,
        ticket-price: uint,
        is-active: bool,
        refund-window: uint,
        revenue: uint,
        category: (string-utf8 50)
    }
)

(define-map Tickets
    { ticket-id: uint }
    {
        event-id: uint,
        owner: principal,
        purchase-price: uint,
        purchase-date: uint,
        is-used: bool,
        is-refunded: bool,
        seat-number: (optional uint)
    }
)

(define-map EventTickets
    { event-id: uint }
    { ticket-ids: (list 1000 uint) }
)

(define-map UserTickets
    { user: principal }
    { owned-tickets: (list 1000 uint) }
)

(define-map OrganizerRevenue
    { organizer: principal }
    {
        total-revenue: uint,
        pending-withdrawals: uint,
        events-organized: uint
    }
)