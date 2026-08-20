from collections import Counter, defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from myappLubd.models import Room


class Command(BaseCommand):
    help = 'Backfill nullable Room.property from the legacy Room.properties M2M.'

    def add_arguments(self, parser):
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument('--dry-run', action='store_true', help='Report only; this is the default.')
        mode.add_argument('--apply', action='store_true', help='Populate only unambiguous NULL Room.property rows.')
        parser.add_argument('--batch-size', type=int, default=100)
        parser.add_argument('--room-id', type=int, help='Restrict the audit/backfill to one Room primary key.')

    @staticmethod
    def _legacy_property_ids(room):
        return set(room.properties.values_list('pk', flat=True))

    def _rooms_in_batches(self, queryset, batch_size):
        last_pk = 0
        while True:
            batch = list(
                queryset.filter(pk__gt=last_pk)
                .prefetch_related('properties')
                .order_by('pk')[:batch_size]
            )
            if not batch:
                return
            yield batch
            last_pk = batch[-1].pk

    def handle(self, *args, **options):
        batch_size = options['batch_size']
        if batch_size <= 0:
            raise CommandError('--batch-size must be positive.')

        applying = options['apply']
        queryset = Room.objects.all()
        if options.get('room_id'):
            queryset = queryset.filter(pk=options['room_id'])

        summary = Counter()
        updates_by_property = defaultdict(list)
        missing = []
        conflicting = []
        canonical_conflicts = []

        for batch in self._rooms_in_batches(queryset, batch_size):
            for room in batch:
                summary['TOTAL'] += 1
                legacy_ids = self._legacy_property_ids(room)
                if room.property_id is not None:
                    summary['CANONICAL POPULATED'] += 1
                    if legacy_ids == {room.property_id}:
                        summary['ALREADY MATCHING'] += 1
                    else:
                        summary['CANONICAL/LEGACY CONFLICT'] += 1
                        canonical_conflicts.append((room.pk, room.property_id, sorted(legacy_ids)))
                    continue

                summary['CANONICAL NULL'] += 1
                if not legacy_ids:
                    summary['MISSING'] += 1
                    missing.append(room.pk)
                elif len(legacy_ids) > 1:
                    summary['CONFLICTING'] += 1
                    conflicting.append((room.pk, sorted(legacy_ids)))
                else:
                    summary['UNAMBIGUOUS'] += 1
                    updates_by_property[next(iter(legacy_ids))].append(room.pk)

        summary['WOULD UPDATE'] = sum(map(len, updates_by_property.values()))
        summary['SKIPPED'] = summary['CANONICAL POPULATED'] + summary['MISSING'] + summary['CONFLICTING']
        self.stdout.write(f"MODE: {'APPLY' if applying else 'DRY RUN'}")
        for key in ('TOTAL', 'CANONICAL NULL', 'CANONICAL POPULATED', 'UNAMBIGUOUS', 'MISSING', 'CONFLICTING', 'ALREADY MATCHING', 'CANONICAL/LEGACY CONFLICT', 'WOULD UPDATE', 'SKIPPED'):
            self.stdout.write(f'{key}: {summary[key]}')
        for property_id, room_ids in sorted(updates_by_property.items()):
            self.stdout.write(f'WOULD UPDATE PROPERTY {property_id}: {len(room_ids)}')
        self.stdout.write(f'MISSING ROOMS: {missing or "none"}')
        self.stdout.write(f'CONFLICTING ROOMS: {conflicting or "none"}')
        self.stdout.write(f'CANONICAL/LEGACY CONFLICTS: {canonical_conflicts or "none"}')

        if not applying:
            self.stdout.write(self.style.SUCCESS('Dry run complete: zero rows written.'))
            return
        if canonical_conflicts:
            raise CommandError('CANONICAL/LEGACY CONFLICT detected; no rows were updated.')

        updated = 0
        recheck_skipped = 0
        for expected_property_id, room_ids in updates_by_property.items():
            for start in range(0, len(room_ids), batch_size):
                with transaction.atomic():
                    locked_rooms = list(
                        Room.objects.select_for_update().filter(pk__in=room_ids[start:start + batch_size])
                        .prefetch_related('properties').order_by('pk')
                    )
                    for room in locked_rooms:
                        legacy_ids = self._legacy_property_ids(room)
                        if room.property_id is not None or legacy_ids != {expected_property_id}:
                            recheck_skipped += 1
                            continue
                        updated += Room.objects.filter(pk=room.pk, property__isnull=True).update(
                            property_id=expected_property_id
                        )

        self.stdout.write(f'UPDATED: {updated}')
        self.stdout.write(f'RECHECK SKIPPED: {recheck_skipped}')
        self.stdout.write(self.style.SUCCESS('Backfill apply complete.'))
