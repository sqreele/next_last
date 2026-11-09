from rest_framework import serializers


class PropertyDraftSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(max_length=2000, required=False, allow_blank=True)


class CompanyPreviewSerializer(serializers.Serializer):
    tenant_id = serializers.CharField(max_length=16)
    action = serializers.ChoiceField(choices=['start', 'add', 'remove', 'cancel', 'reactivate'])
    property_ids = serializers.ListField(child=serializers.CharField(max_length=50), required=False, default=list)
    draft = PropertyDraftSerializer(required=False)
    payment_method = serializers.ChoiceField(choices=['card', 'promptpay'], default='card')

    def to_internal_value(self, data):
        if set(data) - set(self.fields):
            raise serializers.ValidationError({'detail': 'Unsupported billing fields; prices and quantities are server-owned.'})
        return super().to_internal_value(data)


class CompanyConfirmSerializer(serializers.Serializer):
    tenant_id = serializers.CharField(max_length=16)
    operation_id = serializers.UUIDField()

    def to_internal_value(self, data):
        if set(data) - set(self.fields):
            raise serializers.ValidationError({'detail': 'Only the approved operation identity can be confirmed.'})
        return super().to_internal_value(data)
