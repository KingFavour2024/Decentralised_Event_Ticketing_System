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


;; Data Variables
(define-data-var contract-owner principal tx-sender)
(define-data-var next-event-id uint u1)
(define-data-var next-ticket-id uint u1)
(define-data-var platform-fee-percent uint u5)
(define-data-var min-ticket-price uint u1000000) ;; in microSTX
(define-data-var max-refund-window uint u1209600) ;; 14 days in blocks


;; Read-Only Functions
(define-read-only (get-event (event-id uint))
    (map-get? Events { event-id: event-id })
)

(define-read-only (get-ticket (ticket-id uint))
    (map-get? Tickets { ticket-id: ticket-id })
)

(define-read-only (get-user-tickets (user principal))
    (map-get? UserTickets { user: user })
)

(define-read-only (get-organizer-revenue (organizer principal))
    (map-get? OrganizerRevenue { organizer: organizer })
)

(define-read-only (calculate-platform-fee (amount uint))
    (/ (* amount (var-get platform-fee-percent)) u100)
)


;; Event Management Functions
(define-public (create-event
    (name (string-utf8 100))
    (description (string-utf8 500))
    (venue (string-utf8 100))
    (date uint)
    (total-tickets uint)
    (ticket-price uint)
    (refund-window uint)
    (category (string-utf8 50))
)
    (let
        ((event-id (var-get next-event-id))
         (caller tx-sender))
        
        ;; Validate inputs
        (asserts! (>= ticket-price (var-get min-ticket-price)) ERR-INVALID-PRICE)
        (asserts! (<= refund-window (var-get max-refund-window)) ERR-INVALID-PRICE)
        (asserts! (> date block-height) ERR-EVENT-EXPIRED)
        
        (ok (begin
            ;; Create event
            (map-set Events
                { event-id: event-id }
                {
                    name: name,
                    description: description,
                    organizer: caller,
                    venue: venue,
                    date: date,
                    total-tickets: total-tickets,
                    tickets-sold: u0,
                    ticket-price: ticket-price,
                    is-active: true,
                    refund-window: refund-window,
                    revenue: u0,
                    category: category
                }
            )
            
            ;; Initialize event tickets
            (map-set EventTickets
                { event-id: event-id }
                { ticket-ids: (list) }
            )
            
            ;; Update organizer data
            (match (get-organizer-revenue caller)
                prev-data (map-set OrganizerRevenue
                    { organizer: caller }
                    {
                        total-revenue: (get total-revenue prev-data),
                        pending-withdrawals: (get pending-withdrawals prev-data),
                        events-organized: (+ (get events-organized prev-data) u1)
                    }
                )
                (map-set OrganizerRevenue
                    { organizer: caller }
                    {
                        total-revenue: u0,
                        pending-withdrawals: u0,
                        events-organized: u1
                    }
                )
            )
            
            ;; Increment event counter
            (var-set next-event-id (+ event-id u1))
        ))
    )
)


;; Ticket Purchase and Management
(define-public (purchase-ticket (event-id uint))
    (let
        ((caller tx-sender)
         (event (unwrap! (get-event event-id) ERR-EVENT-NOT-FOUND))
         (ticket-id (var-get next-ticket-id)))
        
        ;; Validate purchase
        (asserts! (get is-active event) ERR-EVENT-EXPIRED)
        (asserts! (< (get tickets-sold event) (get total-tickets event)) ERR-SOLD-OUT)
        
        ;; Process payment
        (try! (stx-transfer? (get ticket-price event) caller (get organizer event)))
        
        (ok (begin
            ;; Create ticket
            (map-set Tickets
                { ticket-id: ticket-id }
                {
                    event-id: event-id,
                    owner: caller,
                    purchase-price: (get ticket-price event),
                    purchase-date: block-height,
                    is-used: false,
                    is-refunded: false,
                    seat-number: none
                }
            )
            
            ;; Update event data
            (map-set Events
                { event-id: event-id }
                (merge event {
                    tickets-sold: (+ (get tickets-sold event) u1),
                    revenue: (+ (get revenue event) (get ticket-price event))
                })
            )
            
            ;; Update user tickets
            (match (get-user-tickets caller)
                prev-tickets (map-set UserTickets
                    { user: caller }
                    { owned-tickets: (unwrap! (as-max-len? 
                        (append (get owned-tickets prev-tickets) ticket-id) u1000
                    ) ERR-NOT-AUTHORIZED) }
                )
                (map-set UserTickets
                    { user: caller }
                    { owned-tickets: (list ticket-id) }
                )
            )
            
            ;; Update event tickets
            (match (map-get? EventTickets { event-id: event-id })
                prev-tickets (map-set EventTickets
                    { event-id: event-id }
                    { ticket-ids: (unwrap! (as-max-len? 
                        (append (get ticket-ids prev-tickets) ticket-id) u1000
                    ) ERR-NOT-AUTHORIZED) }
                )
                (map-set EventTickets
                    { event-id: event-id }
                    { ticket-ids: (list ticket-id) }
                )
            )
            
            ;; Increment ticket counter
            (var-set next-ticket-id (+ ticket-id u1))
        ))
    )
)
